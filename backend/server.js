// =====================================
// MediformAI Backend Server
// =====================================

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import pkg from "pg";
import { v4 as uuidv4 } from "uuid";
import { uploadToAzure } from "./utils/azureUpload.js";
import fs from "fs";
import { getBlobSasUrl } from "./utils/azureSAS.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { MCR_EXTRACTION_PROMPT } from "./prompts/mcr_extraction_prompt.js";
import { runOCR } from "./services/ocr/runOCR.js";



const { Pool } = pkg;

const app = express();

console.log("🔍 Running server file:", import.meta.url);
console.log("OCR endpoint:", process.env.AZURE_OCR_ENDPOINT);
console.log("OCR key loaded:", !!process.env.AZURE_OCR_KEY);

// =====================================
// Middleware
// =====================================
app.use(bodyParser.json({ limit: "100mb" }));

// ✅ CORS setup — allows frontend + credentials
const allowedOrigins = [
  "http://localhost:5173",
  "https://mediform-ai.vercel.app",
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      console.warn("❌ Blocked by CORS:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Authorization"],
  })
);


// handle preflight manually (some browsers require this)
app.options("*", cors());



// =====================================
// PostgreSQL connection
// =====================================
const pool = new Pool({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  port: process.env.PG_PORT || 5432,
  ssl: { rejectUnauthorized: false }
});

// =====================================
// Auth helpers
// =====================================
const JWT_SECRET = process.env.JWT_SECRET || "supersecretjwtkey";

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
}

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Missing token" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error("JWT verify error:", err);
    res.status(403).json({ error: "Invalid or expired token" });
  }
}

// =====================================
// Auth routes
// =====================================

// Register (optional for first admin)
app.post("/api/register", async (req, res) => {
  const { username, password, role = "user" } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Username and password required" });

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role",
      [username, hash, role]
    );
    const token = generateToken(rows[0]);
    res.json({ message: "User registered", token, user: rows[0] });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Missing username or password" });

  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE username=$1", [
      username,
    ]);
    if (rows.length === 0)
      return res.status(401).json({ error: "Invalid credentials" });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    const token = generateToken(user);
    res.json({
      message: "Login successful",
      token,
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// Validate token
app.get("/api/verify-token", verifyToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// Logout (handled client-side by removing token)
app.post("/api/logout", (req, res) => {
  res.json({ message: "Logged out" });
});


// -------------------------------------
// Normalise Yes/No fields → always "Yes"/"No"/null for DB text fields
// -------------------------------------
function normalizeYN(value) {
  if (value == null || value === "") return null;

  const v = String(value).trim().toLowerCase();

  // ✅ True-like inputs
  if (["yes", "y", "true", "t", "1", "pos", "positive", "+", "✓", "checked"].includes(v))
    return "Yes";

  // ✅ False-like inputs
  if (["no", "n", "false", "f", "0", "neg", "negative", "-", "✗", "x"].includes(v))
    return "No";

  // ✅ Anything like "Declined", "Unknown", etc.
  if (["declined", "unknown", "n/a", "na", "not done", "refused", "none"].includes(v))
    return "Declined";

  // Fallback – keep original text if it’s something like "Maybe"
  return value;
}


// =====================================
// POST /api/extract-form
// =====================================

app.post("/api/extract-form", verifyToken, async (req, res) => {
  try {
    function normalizeFieldKeys(obj) {
      if (!obj || typeof obj !== "object") return obj;
      const fixed = {};
      for (const [k, v] of Object.entries(obj)) {
        fixed[k.trim().toLowerCase()] = v;
      }
      return fixed;
    }

    const { filename, fileData, contentType } = req.body;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!openaiApiKey) {
      return res.status(500).json({ error: "Missing OpenAI API key" });
    }

    // ----------------------------------------------------------
    // 0. Fix filename / content type if PDF
    // ----------------------------------------------------------
    const base64Payload = fileData.includes(",")
      ? fileData.split(",")[1]
      : fileData;

    let fixedFilename = filename;
    let fixedContentType = contentType;

    if (base64Payload.trim().startsWith("JVBER")) {
      fixedFilename = filename.replace(/\.[^.]+$/i, ".pdf");
      fixedContentType = "application/pdf";
      console.log("🔧 Detected PDF upload. Using filename:", fixedFilename);
    }

    // =====================================
    // Step 1: Build PDF buffer, upload to Azure, run OCR
    // =====================================
    const pdfBuffer = Buffer.from(base64Payload, "base64");

    const pdfBlobName = `${uuidv4()}-${fixedFilename}`;

    const pdfUrl = await uploadToAzure(pdfBlobName, pdfBuffer, fixedContentType);
    console.log("📄 PDF uploaded to Azure:", pdfUrl);

    // ✅ ENABLE OCR AGAIN
    let ocrText = "";
    try {
      ocrText = await runOCR(pdfBuffer);
      console.log("🔍 OCR extracted text:", ocrText.slice(0, 200));
    } catch (err) {
      console.warn("⚠️ OCR failed:", err.message);
    }

    // =====================================
    // Step 1B: Upload PDF to OpenAI Files API
    // =====================================
    console.log("📤 Uploading PDF to OpenAI…");

    const uploadRes = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: (() => {
        const form = new FormData();
        form.append(
          "file",
          new Blob([pdfBuffer], { type: "application/pdf" }),
          fixedFilename
        );
        form.append("purpose", "assistants");
        return form;
      })(),
    });

    const pdfFile = await uploadRes.json();

    if (!uploadRes.ok) {
      throw new Error(
        "Failed to upload PDF to OpenAI: " + JSON.stringify(pdfFile)
      );
    }

    console.log("📄 OpenAI file uploaded:", pdfFile.id);

    // =====================================
    // Step 2: Send prompt + PDF file to GPT-4.1
    // =====================================

    console.log("🧠 Sending PDF to OpenAI GPT-4.1…");

    const openaiResponse = await fetch(
  "https://api.openai.com/v1/chat/completions",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: process.env.GPT_MODEL_VERSION, // MUST be gpt-4.1 or better
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
${MCR_EXTRACTION_PROMPT}

----- OCR ASSIST -----
${ocrText || "No OCR fallback text"}
----------------------
              `,
            },
            {
              type: "file",
              file: { file_id: pdfFile.id },
            },
          ],
        },
      ],
      max_tokens: 3000,
    }),
  }
);


    // =====================================
    // Step 3: Parse JSON from OpenAI response
    // =====================================

    if (!openaiResponse.ok) {
      const err = await openaiResponse.text();
      throw new Error(`OpenAI API error: ${err}`);
    }

    let extractedText = "{}";
    let extracted = {};

    try {
      let openaiData;
      try {
        openaiData = await openaiResponse.json();
      } catch {
        const text = await openaiResponse.text();
        console.error("OpenAI returned non-JSON:", text);
        throw new Error("OpenAI returned HTML instead of JSON");
      }
      extractedText = openaiData.choices?.[0]?.message?.content || "{}";

      console.log("🔍 Raw OpenAI output:\n", extractedText);

      const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
      extracted = JSON.parse(jsonMatch ? jsonMatch[0] : extractedText);

      if (Array.isArray(extracted.sections)) {
        extracted.sections = extracted.sections.map((sec) => {

          // 🔥 FIX 1: Ensure fields is ALWAYS a plain object
          let rawFields = sec.fields;
          if (!rawFields || typeof rawFields !== "object" || Array.isArray(rawFields)) {
            rawFields = {};
          }

          // 🔥 FIX 2: Normalize keys safely
          const lowerFields = normalizeFieldKeys(rawFields);

          // 🔥 FIX 3: Wrap fields in a safe proxy
          const caseInsensitive = new Proxy(lowerFields, {
            get(target, name) {
              if (typeof name === "string") {
                return target[name.toLowerCase()];
              }
              return undefined;
            },
          });

          return { ...sec, fields: caseInsensitive };
        });
      }

    } catch (err) {
      console.error("⚠️ JSON parse error:", err);
      extracted = {
        form_name: "Extracted Form (Unparsed)",
        sections: [
          {
            section_name: "Raw OCR Output",
            fields: {
              raw_text: extractedText || "No readable data returned by model.",
            },
          },
        ],
      };
    }

    // =====================================
    // Step 4: Insert into main forms table
    // =====================================
    const formId = uuidv4();
    const header =
      extracted.sections?.find((s) => s.section_name === "Header Identification")
        ?.fields || {};

    // ✅ Add this line to fix the "uploadedAt is not defined" error
    const uploadedAt = new Date().toISOString();


   const insertFormQuery = `
      INSERT INTO forms (
        id, file_name, file_url, file_type,
        healthcare_worker_name, clinic, folder_number,
        patient_name, mom_connected, age, date_of_birth, gravida, para, miscarriages,
        upload_date
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    `;


    await pool.query(insertFormQuery, [
      formId,
      filename,
      pdfUrl,
      fixedContentType,
      header["healthcare_worker_name"] || null,
      header["clinic"] || null,
      header["folder_number"] || null,
      header["patient_name"] || null,
      header["mom_connected"] || null,
      header["age"] || null,
      header["date_of_birth"] || null,   // ⭐ NEW
      header["gravida"] || null,
      header["para"] || null,
      header["miscarriages"] || null,
      uploadedAt,
    ]);

    console.log("✅ Inserted form row:", formId);


// =====================================
// Step 4b: Medical & General History (FIXED FINAL VERSION)
// =====================================
const medical = normalizeFieldKeys(
  extracted.sections?.find((s) => s.section_name === "Medical and General History")?.fields || {}
);

// Normalize Family History fields (from OCR)
for (const key of Object.keys(medical)) {
  if (key.toLowerCase().startsWith("family history")) {
    const shortKey = key.replace(/Family History\s*/i, "").trim().toLowerCase().replace(/\s+/g, "_");
    medical[`family_history_${shortKey}`] = medical[key];
    delete medical[key];
  }
}

await pool.query(
  `
  UPDATE forms SET
    hypertension = $2,
    diabetes = $3,
    cardiac = $4,
    asthma = $5,
    tuberculosis = $6,
    epilepsy = $7,
    mental_health_disorder = $8,
    hiv = $9,
    other_condition = $10,
    family_history_diabetes = $11,
    family_history_tb = $12,
    family_history_twins = $13,
    family_history_congenital = $14,
    family_history_details = $15,
    medication = $16,
    operations = $17,
    allergies = $18,
    tb_symptom_screen = $19,
    alcohol_use = $20,
    tobacco_use = $21,
    substance_use = $22,
    type_of_substance_used = $23,
    psychosocial_risk_factors = $24
  WHERE id = $1
  `,
  [
    formId,
    normalizeYN(medical["hypertension"]),
    normalizeYN(medical["diabetes"]),
    normalizeYN(medical["cardiac"]),
    normalizeYN(medical["asthma"]),
    normalizeYN(medical["tuberculosis"]),
    normalizeYN(medical["epilepsy"]),
    normalizeYN(medical["mental_health_disorder"]),
    normalizeYN(medical["hiv"]),
    medical["other_condition"] || null,
    normalizeYN(medical["family_history_diabetes"]),
    normalizeYN(medical["family_history_tb"]),
    normalizeYN(medical["family_history_twins"]),
    normalizeYN(medical["family_history_congenital"]),
    medical["family_history_details"] || null,
    medical["medication"] || null,
    medical["operations"] || null,
    medical["allergies"] || null,
    normalizeYN(medical["tb_symptom_screen"]),
    normalizeYN(medical["alcohol_use"]),
    normalizeYN(medical["tobacco_use"]),
    normalizeYN(medical["substance_use"]),
    medical["type_of_substance_used"] || null,
    medical["psychosocial_risk_factors"] || null,
  ]
);


// =====================================
// Step 4c: Examination
// =====================================
const exam = normalizeFieldKeys(
  extracted.sections?.find((s) => s.section_name === "Examination")?.fields || {}
);

await pool.query(
  `
  UPDATE forms SET
    bp = $2,                 -- systolic (existing)
    bp_dia = $3,             -- diastolic (NEW)
    urine = $4,
    height = $5,
    weight = $6,
    muac = $7,
    bmi = $8,
    thyroid = $9,
    breasts = $10,
    heart = $11,
    lungs = $12,
    abdomen = $13,
    sf_measurement_at_booking = $14
  WHERE id = $1
  `,
  [
    formId,

    // NEW ordering — systolic first, diastolic second
    exam["bp"] || null,
    exam["bp_dia"] || null,
    exam["urine"] || null,
    exam["height"] || null,
    exam["weight"] || null,
    exam["muac"] || null,
    exam["bmi"] || null,
    exam["thyroid"] || null,
    exam["breasts"] || null,
    exam["heart"] || null,
    exam["lungs"] || null,
    exam["abdomen"] || null,
    exam["sf_measurement_at_booking"] || null,
  ]
);



// =====================================
// Step 4d: Vaginal Examination
// =====================================
const vaginal = normalizeFieldKeys(
  extracted.sections?.find((s) => s.section_name === "Vaginal Examination")?.fields || {}
);

await pool.query(
  `
  UPDATE forms SET
    permission_obtained = $2, vulva_and_vagina = $3,
    cervix = $4, uterus = $5,
    pap_smear_done = $6, pap_smear_result = $7
  WHERE id = $1
  `,
  [
    formId,
    normalizeYN(vaginal["permission_obtained"]),
    vaginal["vulva_and_vagina"] || null,
    vaginal["cervix"] || null,
    vaginal["uterus"] || null,
    normalizeYN(vaginal["pap_smear_done"]),
    vaginal["pap_smear_result"] || null,
  ]
);

// =====================================
// Step 4e: Gestational Age (UPDATED TO MATCH UI + DB)
// =====================================
const gestation = normalizeFieldKeys(
  extracted.sections?.find((s) => s.section_name === "Gestational Age")?.fields || {}
);

await pool.query(
  `
  UPDATE forms SET
    lnmp = $2,
    certain = $3,
    sonar_date = $4,
    bpd = $5,
    hc = $6,
    ac = $7,
    fl = $8,
    crl = $9,
    placenta = $10,
    afi = $11,
    average_gestation = $12,
    singleton = $13,
    multiple_pregnancy = $14,
    intrauterine_pregnancy = $15,
    estimated_date_of_delivery = $16,
    edd_method_sonar = $17,
    edd_method_sf = $18,
    edd_method_lnmp = $19
  WHERE id = $1
  `,
  [
    formId,
    gestation["lnmp"] || null,
    normalizeYN(gestation["certain"]),
    gestation["sonar_date"] || null,
    gestation["bpd"] || null,
    gestation["hc"] || null,
    gestation["ac"] || null,
    gestation["fl"] || null,
    gestation["crl"] || null,
    gestation["placenta"] || null,
    gestation["afi"] || null,
    gestation["average_gestation"] || null,
    gestation["singleton"] === true,
    gestation["multiple_pregnancy"] === true,
    gestation["intrauterine_pregnancy"] === true,
    gestation["estimated_date_of_delivery"] || null,
    gestation["edd_method_sonar"] === true,
    gestation["edd_method_sf"] === true,
    gestation["edd_method_lnmp"] === true,
  ]
);



// =====================================
// Step 4f: Mental Health
// =====================================
const mental = normalizeFieldKeys(
  extracted.sections?.find((s) => s.section_name === "Mental Health")?.fields || {}
);

await pool.query(
  `
  UPDATE forms SET
    screening_performed = $2, mental_health_score = $3,
    discussed_in_record = $4, referred_to = $5
  WHERE id = $1
  `,
  [
    formId,
    normalizeYN(mental["screening_performed"]),
    mental["score"] || null,
    normalizeYN(mental["discussed_in_record"]),
    mental["referred_to"] || null,
  ]
);

// =====================================
// Step 4g: Birth Companion
// =====================================
const birth = normalizeFieldKeys(
  extracted.sections?.find((s) => s.section_name === "Birth Companion")?.fields || {}
);

await pool.query(
  `
  UPDATE forms SET
    discussed = $2
  WHERE id = $1
  `,
  [formId, normalizeYN(birth["discussed"])]
);



// =====================================
// Step 4h: Future Contraception (FINAL CORRECT VERSION)
// =====================================
const contraception = normalizeFieldKeys(
  extracted.sections?.find((s) => s.section_name === "Future Contraception")?.fields || {}
);

await pool.query(
  `
  UPDATE forms SET
    implant = $2,
    inject = $3,
    iud = $4,
    tubal_ligation = $5,
    oral = $6,
    management_plans_discussed = $7,
    educational_material_given = $8,
    tubal_ligation_counselling = $9
  WHERE id = $1
  `,
  [
    formId,
    normalizeYN(contraception["implant"]),
    normalizeYN(contraception["inject"]),
    normalizeYN(contraception["iud"]),
    normalizeYN(contraception["tubal_ligation"]),
    normalizeYN(contraception["oral"]),
    normalizeYN(contraception["management_plans_discussed"]),
    normalizeYN(contraception["educational_material_given"]),
    normalizeYN(contraception["tubal_ligation_counselling"])
  ]
);


// =====================================
// Step 4i: Booking Visit and Assessment
// =====================================
const booking = normalizeFieldKeys(
  extracted.sections?.find((s) => s.section_name === "Booking Visit and Assessment")?.fields || {}
);

await pool.query(
  `
  UPDATE forms SET
    booking_done_by = $2,
    booking_date = $3
  WHERE id = $1
  `,
  [
    formId,
    booking["booking_done_by"] || null,
    booking["booking_date"] || null
  ]
);


// =====================================
// Step 4j: Notes
// =====================================
const notesSection = normalizeFieldKeys(
  extracted.sections?.find((s) => s.section_name === "Notes")?.fields || {}
);

await pool.query(
  `
  UPDATE forms SET
    notes = $2
  WHERE id = $1
  `,
  [
    formId,
    notesSection["notes"] || null
  ]
);

    // =====================================
// Step 5: Handle repeating sections
// =====================================

// ---- Obstetric and Neonatal History ----
const obstetricSection = extracted.sections?.find(
  (s) => s.section_name === "Obstetric and Neonatal History"
);

// GPT returns: records: [{ year, gestation, delivery, weight, sex, outcome, complications }]
const obstetricRecords =
  obstetricSection?.records?.map((rec, index) => ({
    id: uuidv4(),
    form_id: formId,
    record_number: index + 1,
    year: rec.year || null,
    gestation: rec.gestation || null,
    delivery: rec.delivery || null,
    weight: rec.weight || null,
    sex: rec.sex || null,
    outcome: rec.outcome || null,
    complications: rec.complications || null,
    description_of_complications:
      obstetricSection.description_of_complications || null,
  })) || [];

// INSERT each row
for (const record of obstetricRecords) {
  await pool.query(
    `
    INSERT INTO obstetric_neonatal_history
      (id, form_id, record_number, year, gestation, delivery,
       weight, sex, outcome, complications, description_of_complications)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `,
    [
      record.id,
      record.form_id,
      record.record_number,
      record.year,
      record.gestation,
      record.delivery,
      record.weight,
      record.sex,
      record.outcome,
      record.complications,
      record.description_of_complications,
    ]
  );
}


// ---- Investigations ----
const investigations =
  extracted.sections?.find((s) => s.section_name === "Investigations")?.fields || {};

await pool.query(
  `INSERT INTO investigations (
     id, form_id,
     syphilis_test_date, syphilis_test_result,
     repeat_syphilis_test_date, repeat_syphilis_test_result,
     hiv_booking_date, hiv_booking_result, hiv_booking_on_art,
     hiv_retest_1_date, hiv_retest_1_result, hiv_retest_1_on_art, hiv_retest_1_declined,
     hiv_retest_2_date, hiv_retest_2_result, hiv_retest_2_on_art, hiv_retest_2_declined,
     hiv_retest_3_date, hiv_retest_3_result, hiv_retest_3_on_art, hiv_retest_3_declined,
     cd4,
     viral_load_1_date, viral_load_1_result,
     viral_load_2_date, viral_load_2_result,
     viral_load_3_date, viral_load_3_result,
     other,
     hb,
     treatment_1, treatment_2, treatment_3,
     rhesus, antibodies,
     urine_mcs_date, urine_mcs_result,

     -- ⭐ Correct GDM fields
     screening_for_gestational_diabetes_1,
     screening_for_gestational_diabetes_2,
     screening_gdm_28w,

     art_initiated_on,
     tetox_1, tetox_2, tetox_3,
     tetox_notes,
     hiv_status_at_booking, hiv_booking_declined,
     hiv_notes,
     tet_tox_1, tet_tox_2, tet_tox_3
   )
   VALUES (
     $1,$2,
     $3,$4,
     $5,$6,
     $7,$8,$9,
     $10,$11,$12,$13,
     $14,$15,$16,$17,
     $18,$19,$20,$21,
     $22,
     $23,$24,
     $25,$26,
     $27,$28,
     $29,
     $30,
     $31,$32,$33,
     $34,$35,
     $36,$37,

     -- ⭐ Correct GDM placeholders
     $38,$39,$40,

     $41,
     $42,$43,$44,
     $45,
     $46,$47,
     $48,
     $49,$50,$51
   )`,
  [
    uuidv4(), formId,

    investigations.syphilis_test_date || null,
    investigations.syphilis_test_result || null,

    investigations.repeat_syphilis_test_date || null,
    investigations.repeat_syphilis_test_result || null,

    investigations.hiv_booking_date || null,
    investigations.hiv_booking_result || null,
    normalizeYN(investigations.hiv_booking_on_art),

    investigations.hiv_retest_1_date || null,
    investigations.hiv_retest_1_result || null,
    normalizeYN(investigations.hiv_retest_1_on_art),
    normalizeYN(investigations.hiv_retest_1_declined),

    investigations.hiv_retest_2_date || null,
    investigations.hiv_retest_2_result || null,
    normalizeYN(investigations.hiv_retest_2_on_art),
    normalizeYN(investigations.hiv_retest_2_declined),

    investigations.hiv_retest_3_date || null,
    investigations.hiv_retest_3_result || null,
    normalizeYN(investigations.hiv_retest_3_on_art),
    normalizeYN(investigations.hiv_retest_3_declined),

    investigations.cd4 || null,

    investigations.viral_load_1_date || null,
    investigations.viral_load_1_result || null,
    investigations.viral_load_2_date || null,
    investigations.viral_load_2_result || null,
    investigations.viral_load_3_date || null,
    investigations.viral_load_3_result || null,

    investigations.other || null,

    investigations.hb || null,

    investigations.treatment_1 || null,
    investigations.treatment_2 || null,
    investigations.treatment_3 || null,

    investigations.rhesus || null,
    investigations.antibodies || null,

    investigations.urine_mcs_date || null,
    investigations.urine_mcs_result || null,

    // ⭐ Correct GDM fields
    investigations.screening_for_gestational_diabetes_1 || null,
    investigations.screening_for_gestational_diabetes_2 || null,
    investigations.screening_gdm_28w || null,

    investigations.art_initiated_on || null,

    investigations.tetox_1 || null,
    investigations.tetox_2 || null,
    investigations.tetox_3 || null,
    investigations.tetox_notes || null,

    investigations.hiv_status_at_booking || null,
    normalizeYN(investigations.hiv_booking_declined),

    investigations.hiv_notes || null,

    investigations.tet_tox_1 || null,
    investigations.tet_tox_2 || null,
    investigations.tet_tox_3 || null
  ]
);



    // ---- Counselling ----
const normalize = (s) =>
  s?.toString().trim().replace(/\s+/g, " ").toLowerCase();

const counselling =
  extracted.sections?.find(
    (s) => normalize(s.section_name) === "counselling"
  )?.fields || {};

const counsellingRecords = Object.entries(counselling).reduce((acc, [key, val]) => {
  // ✅ Match both "Counselling 1 Date 1" and "counselling_1_date_1"
  const match = key.match(/^counselling[_\s]*(\d+)[_\s]*(topic|date[_\s]*1|date[_\s]*2)$/i);
  if (match) {
    const [, num, field] = match;
    if (!acc[num]) acc[num] = { record_number: parseInt(num), form_id: formId };

    // ✅ Assign topic/date values case-insensitively
    if (/topic/i.test(field)) acc[num].topic = val?.trim() || null;
    else if (/date[_\s]*1/i.test(field)) acc[num].date_1 = val?.trim() || null;
    else if (/date[_\s]*2/i.test(field)) acc[num].date_2 = val?.trim() || null;
  }
  return acc;
}, {});

// ✅ Debug: confirm parsing worked
console.log("🧾 Parsed counselling records:", counsellingRecords);

// ✅ Insert each counselling record (NO date parsing)
for (const record of Object.values(counsellingRecords)) {
  await pool.query(
    `INSERT INTO counselling
      (id, form_id, record_number, topic, date_1, date_2)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      uuidv4(),
      formId,
      record.record_number,
      record.topic || null,
      record.date_1 || null,   // ← RAW TEXT (correct)
      record.date_2 || null,   // ← RAW TEXT (correct)
    ]
  );
}



    // =====================================
    // Step 6: Done
    // =====================================
    res.json({
      success: true,
      form_id: formId,
      file_url: pdfUrl,
      message: "✅ Form extracted and saved successfully"
    });
  } catch (err) {
    console.error("❌ Error processing form:", err);
    res.status(500).json({ error: err.message });
  }
});

// =====================================
// GET /api/forms  -> list minimal for sidebar
// =====================================
app.get("/api/forms", verifyToken, async (_req, res) => {
  try {
    const { rows } = await pool.query(
  `SELECT id, file_name, upload_date, has_issue, is_completed
     FROM forms
     ORDER BY upload_date DESC`
);

    res.json(rows);
  } catch (err) {
    console.error("GET /api/forms error:", err);
    res.status(500).json({ error: err.message });
  }
});

// =====================================
// GET /api/forms/:id  → full structured record
// =====================================
app.get("/api/forms/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || id === "null") {
      return res.status(400).json({ error: "Invalid form ID" });
    }

    // ---- Main form ----
    const formQ = await pool.query(`SELECT * FROM forms WHERE id = $1`, [id]);
    if (formQ.rowCount === 0)
      return res.status(404).json({ error: "Form not found" });
    const form = formQ.rows[0];

    form.filename = form.file_name;


    // ---- Obstetric & Neonatal ----
    const obstetricQ = await pool.query(
      `SELECT id, form_id, record_number, year, gestation, delivery, weight, sex,
              outcome, complications, description_of_complications
       FROM obstetric_neonatal_history
       WHERE form_id = $1
       ORDER BY COALESCE(record_number, 0), id`,
      [id]
    );

    // ---- Investigations (full schema) ----
    const investigationsQ = await pool.query(
  `SELECT
      id, form_id,
      syphilis_test_date, syphilis_test_result,
      repeat_syphilis_test_date, repeat_syphilis_test_result,
      hiv_booking_date, hiv_booking_result, hiv_booking_on_art,
      hiv_retest_1_date, hiv_retest_1_result, hiv_retest_1_on_art, hiv_retest_1_declined,
      hiv_retest_2_date, hiv_retest_2_result, hiv_retest_2_on_art, hiv_retest_2_declined,
      hiv_retest_3_date, hiv_retest_3_result, hiv_retest_3_on_art, hiv_retest_3_declined,
      cd4,
      viral_load_1_date, viral_load_1_result,
      viral_load_2_date, viral_load_2_result,
      viral_load_3_date, viral_load_3_result,
      hb,
      treatment_1, treatment_2, treatment_3,
      rhesus, antibodies,
      urine_mcs_date, urine_mcs_result,
      screening_for_gestational_diabetes, screening_gdm_28w,
      art_initiated_on,
      tetox_1, tetox_2, tetox_3, tetox_notes,
      hiv_status_at_booking, hiv_booking_declined,
      hiv_notes,
      other
   FROM investigations
   WHERE form_id = $1
   ORDER BY id`,
  [id]
);


    // ---- Counselling ----
    const counsellingQ = await pool.query(
      `SELECT id, form_id, record_number, topic, date_1, date_2
       FROM counselling
       WHERE form_id = $1
       ORDER BY COALESCE(record_number, 0), id`,
      [id]
    );

    // ✅ ---- Response (FINAL FIX) ----
    // Add a "sections" array so the frontend merge logic has data
    res.json({
      form,
      obstetric: obstetricQ.rows,
      investigations: investigationsQ.rows,
      counselling: counsellingQ.rows,
      sections: [
      { section_name: "Header Identification", fields: form },
      { section_name: "Medical and General History", fields: form },
      { section_name: "Examination", fields: form },
      { section_name: "Vaginal Examination", fields: form },
      { section_name: "Gestational Age", fields: form },
      { section_name: "Mental Health", fields: form },
      { section_name: "Birth Companion", fields: form },
      { section_name: "Future Contraception", fields: form },
      { section_name: "Counselling", fields: counsellingQ.rows.reduce((acc, row) => {
          acc[`counselling_${row.record_number}_date_1`] = row.date_1;
          acc[`counselling_${row.record_number}_date_2`] = row.date_2;
          return acc;
        }, {}) },
      { section_name: "Investigations", fields: investigationsQ.rows[0] || {} }
    ]
    });
  } catch (err) {
    console.error("GET /api/forms/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});


// =====================================
// PUT /api/forms/:id  → update all form sections
// =====================================
app.put("/api/forms/:id", verifyToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { form, obstetric, investigations, counselling } = req.body || {};

    if (!id || id === "null") {
      return res.status(400).json({ error: "Invalid form ID" });
    }

    await client.query("BEGIN");

    // ---- Update forms table ----
    if (form && Object.keys(form).length > 0) {
      const allowedCols = [
        // HEADER
        "healthcare_worker_name","clinic","clinic_date","folder_number","form_date",
        "patient_name", "mom_connected", "age","date_of_birth","gravida","para","miscarriages",

        // MEDICAL HISTORY
        "hypertension","diabetes","cardiac","asthma","tuberculosis","epilepsy",
        "mental_health_disorder","hiv","other_condition","other_condition_detail",
        "family_history_diabetes","family_history_tb","family_history_twins",
        "family_history_congenital","family_history_details",
        "medication","operations","allergies","tb_symptom_screen",
        "use_of_herbal","use_of_otc","tobacco_use","alcohol_use",
        "substance_use","type_of_substance_used","psychosocial_risk_factors",

        // EXAMINATION
        "bp","bp_dia","urine","height","weight","muac","bmi",
        "thyroid","breasts","heart","lungs","abdomen","sf_measurement_at_booking",

        // VAGINAL EXAM
        "permission_obtained","vulva_and_vagina","cervix","uterus",
        "pap_smear_done","pap_smear_date","pap_smear_result",

        // GESTATIONAL AGE (FINAL)
        "lnmp","certain","sonar_date",
        "bpd","hc","ac","fl","crl","placenta","afi","average_gestation",
        "singleton","multiple_pregnancy","intrauterine_pregnancy",
        "estimated_date_of_delivery",
        "edd_method_sonar","edd_method_sf","edd_method_lnmp",

        // MENTAL HEALTH
        "screening_performed","mental_health_score",
        "discussed_in_record","referred_to",

        // BIRTH COMPANION
        "discussed",

        // FUTURE CONTRACEPTION (final, correct)
        "implant","inject","iud","tubal_ligation","oral",
        "management_plans_discussed",
        "educational_material_given",
        "tubal_ligation_counselling",

        // BOOKING VISIT (final, correct)
        "booking_done_by","booking_date",

        // NOTES
        "notes"
      ];



      const sets = [];
      const values = [];
      let idx = 1;
      for (const key of allowedCols) {
        if (key in form) {
          sets.push(`${key} = $${idx++}`);
          values.push(form[key]);
        }
      }
      if (sets.length) {
        values.push(id);
        await client.query(
          `UPDATE forms SET ${sets.join(", ")} WHERE id = $${idx}`,
          values
        );
      }
    }

    // ---- Replace obstetric records ----
    if (Array.isArray(obstetric)) {
      await client.query(`DELETE FROM obstetric_neonatal_history WHERE form_id = $1`, [id]);
      for (const row of obstetric) {
        await client.query(
          `INSERT INTO obstetric_neonatal_history
           (id, form_id, record_number, year, gestation, delivery, weight, sex,
            outcome, complications, description_of_complications)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            row.id || uuidv4(), id,
            row.record_number ?? null,
            row.year ?? null,
            row.gestation ?? null,
            row.delivery ?? null,
            row.weight ?? null,
            row.sex ?? null,
            row.outcome ?? null,
            row.complications ?? null,
            row.description_of_complications ?? null
          ]
        );
      }
    }

      // ---- Replace investigations records ----
if (Array.isArray(investigations)) {
  await client.query(`DELETE FROM investigations WHERE form_id = $1`, [id]);

  for (const row of investigations) {
    await client.query(
      `
      INSERT INTO investigations (
        id, form_id,
        syphilis_test_date, syphilis_test_result,
        repeat_syphilis_test_date, repeat_syphilis_test_result,
        hiv_booking_date, hiv_booking_result, hiv_booking_on_art,
        hiv_retest_1_date, hiv_retest_1_result, hiv_retest_1_on_art, hiv_retest_1_declined,
        hiv_retest_2_date, hiv_retest_2_result, hiv_retest_2_on_art, hiv_retest_2_declined,
        hiv_retest_3_date, hiv_retest_3_result, hiv_retest_3_on_art, hiv_retest_3_declined,
        cd4,
        viral_load_1_date, viral_load_1_result,
        viral_load_2_date, viral_load_2_result,
        viral_load_3_date, viral_load_3_result,
        other,
        hb,
        treatment_1, treatment_2, treatment_3,
        rhesus, antibodies,
        urine_mcs_date, urine_mcs_result,

        -- ⭐ Correct GDM fields
        screening_for_gestational_diabetes_1,
        screening_for_gestational_diabetes_2,
        screening_gdm_28w,

        art_initiated_on,
        tetox_1, tetox_2, tetox_3, tetox_notes,
        hiv_status_at_booking, hiv_booking_declined,
        hiv_notes,
        tet_tox_1, tet_tox_2, tet_tox_3
      )
      VALUES (
        $1,$2,
        $3,$4,
        $5,$6,
        $7,$8,$9,
        $10,$11,$12,$13,
        $14,$15,$16,$17,
        $18,$19,$20,$21,
        $22,
        $23,$24,
        $25,$26,
        $27,$28,
        $29,
        $30,
        $31,$32,$33,
        $34,$35,
        $36,$37,

        -- ⭐ GDM fields in the correct position
        $38,$39,$40,

        $41,
        $42,$43,$44,$45,
        $46,$47,
        $48,
        $49,$50,$51
      )
      `,
      [
        row.id || uuidv4(), id,

        row.syphilis_test_date || null,
        row.syphilis_test_result || null,

        row.repeat_syphilis_test_date || null,
        row.repeat_syphilis_test_result || null,

        row.hiv_booking_date || null,
        row.hiv_booking_result || null,
        normalizeYN(row.hiv_booking_on_art),

        row.hiv_retest_1_date || null,
        row.hiv_retest_1_result || null,
        normalizeYN(row.hiv_retest_1_on_art),
        normalizeYN(row.hiv_retest_1_declined),

        row.hiv_retest_2_date || null,
        row.hiv_retest_2_result || null,
        normalizeYN(row.hiv_retest_2_on_art),
        normalizeYN(row.hiv_retest_2_declined),

        row.hiv_retest_3_date || null,
        row.hiv_retest_3_result || null,
        normalizeYN(row.hiv_retest_3_on_art),
        normalizeYN(row.hiv_retest_3_declined),

        row.cd4 || null,

        row.viral_load_1_date || null,
        row.viral_load_1_result || null,
        row.viral_load_2_date || null,
        row.viral_load_2_result || null,
        row.viral_load_3_date || null,
        row.viral_load_3_result || null,

        row.other || null,
        row.hb || null,

        row.treatment_1 || null,
        row.treatment_2 || null,
        row.treatment_3 || null,

        row.rhesus || null,
        row.antibodies || null,

        row.urine_mcs_date || null,
        row.urine_mcs_result || null,

        // ⭐ Correct GDM fields
        row.screening_for_gestational_diabetes_1 || null,
        row.screening_for_gestational_diabetes_2 || null,
        row.screening_gdm_28w || null,

        row.art_initiated_on || null,

        row.tetox_1 || null,
        row.tetox_2 || null,
        row.tetox_3 || null,
        row.tetox_notes || null,

        row.hiv_status_at_booking || null,
        normalizeYN(row.hiv_booking_declined),

        row.hiv_notes || null,

        row.tet_tox_1 || null,
        row.tet_tox_2 || null,
        row.tet_tox_3 || null
      ]
    );
  }
}

      // ---- Replace counselling records ----
      if (Array.isArray(counselling)) {
        await client.query(`DELETE FROM counselling WHERE form_id = $1`, [id]);

        for (const row of counselling) {
          await client.query(
            `INSERT INTO counselling
            (id, form_id, record_number, topic, date_1, date_2)
            VALUES ($1,$2,$3,$4,$5,$6)`,
            [
              row.id || uuidv4(), id,
              row.record_number ?? null,
              row.topic ?? null,
              row.date_1 ?? null,
              row.date_2 ?? null
            ]
          );
        }
      }

      await client.query("COMMIT");
      res.json({ success: true });

  } catch (err) {
    try { 
      await client.query("ROLLBACK"); 
    } catch {}
    console.error("PUT /api/forms/:id error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// =====================================
// DELETE /api/forms/:id
// (Relies on ON DELETE CASCADE for children)
// =====================================
app.delete("/api/forms/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM forms WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/forms/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// =====================================
// get blob from storage container
// =====================================
app.get("/api/file/:blobName", async (req, res) => {
  try {
    const url = await getBlobSasUrl(req.params.blobName);
    res.json({ url });
  } catch (err) {
    console.error("Error generating SAS URL:", err);
    res.status(500).json({ error: "Failed to generate SAS URL" });
  }
});

// =====================================
// Public Blob Proxy Route (no SAS required)
// =====================================
import { BlobServiceClient } from "@azure/storage-blob";

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const blobService = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);

// ✅ Example: GET /api/files/pdf-uploads/.pdf
app.get("/api/files/:container/:filename", async (req, res) => {
  try {
    const { container, filename } = req.params;

    const containerClient = blobService.getContainerClient(container);
    const blobClient = containerClient.getBlobClient(filename);

    const exists = await blobClient.exists();
    if (!exists) {
      console.error("❌ Blob not found:", filename);
      return res.status(404).json({ error: "File not found" });
    }

    const properties = await blobClient.getProperties();

    res.setHeader("Content-Type", properties.contentType || "application/pdf");
    res.setHeader("Content-Length", properties.contentLength);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

    const download = await blobClient.download(0);
    download.readableStreamBody.pipe(res);

  } catch (err) {
    console.error("❌ Blob fetch error:", err);
    res.status(500).json({ error: "Failed to fetch blob" });
  }
});


// =====================================
// FORM ISSUE TRACKING ROUTES
// =====================================

// Create a new issue for a specific form
app.post("/api/forms/:formId/issues", async (req, res) => {
  const { formId } = req.params;
  const { section_name, field_name, issue_description, created_by } = req.body;

  if (!section_name || !issue_description) {
    return res.status(400).json({ error: "section_name and issue_description are required" });
  }

  const id = uuidv4();

  try {
    await pool.query(
      `INSERT INTO form_issues (id, form_id, section_name, field_name, issue_description, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, formId, section_name, field_name || null, issue_description, created_by || "system"]
    );

    // flag parent form
    await pool.query(`UPDATE forms SET has_issue = TRUE WHERE id=$1`, [formId]);

    res.json({ success: true, id });
  } catch (err) {
    console.error("❌ Error inserting issue:", err);
    res.status(500).json({ error: "Failed to create issue" });
  }
});

// Get all issues for a form
// Get all issues for a form
app.get("/api/forms/:formId/issues", async (req, res) => {
  const { formId } = req.params;

  // 🚫 PREVENT INVALID UUID → important fix
  if (!formId || formId === "null") {
    return res.status(200).json([]); 
  }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM form_issues WHERE form_id=$1 ORDER BY resolved, created_at DESC`,
      [formId]
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ Error loading issues:", err);
    res.status(500).json({ error: "Failed to load issues" });
  }
});


// Resolve or unresolve an issue
app.patch("/api/forms/:formId/issues/:issueId", async (req, res) => {
  const { formId, issueId } = req.params;
  const { resolved, resolved_by } = req.body;

  try {
    if (resolved) {
      await pool.query(
        `UPDATE form_issues
           SET resolved = TRUE,
               resolved_by = $1,
               resolved_at = NOW()
         WHERE id = $2 AND form_id = $3`,
        [resolved_by || "system", issueId, formId]
      );
    } else {
      await pool.query(
        `UPDATE form_issues
           SET resolved = FALSE,
               resolved_by = NULL,
               resolved_at = NULL
         WHERE id = $1 AND form_id = $2`,
        [issueId, formId]
      );
    }

    // recompute parent form flag
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS unresolved FROM form_issues WHERE form_id=$1 AND resolved=FALSE`,
      [formId]
    );
    const stillHas = rows[0].unresolved > 0;
    await pool.query(`UPDATE forms SET has_issue=$1 WHERE id=$2`, [stillHas, formId]);

    res.json({ success: true, has_issue: stillHas });
  } catch (err) {
    console.error("❌ Error updating issue:", err);
    res.status(500).json({ error: "Failed to update issue" });
  }
});

// Mark/unmark a form as completed
app.patch("/api/forms/:formId/completed", async (req, res) => {
  const { formId } = req.params;
  const { is_completed } = req.body;

  try {
    await pool.query(`UPDATE forms SET is_completed=$1 WHERE id=$2`, [!!is_completed, formId]);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error updating completion flag:", err);
    res.status(500).json({ error: "Failed to update completion flag" });
  }
});



// =====================================
// Start server
// =====================================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>
  console.log(`✅ MediformAI backend running on port ${PORT}`)
);
