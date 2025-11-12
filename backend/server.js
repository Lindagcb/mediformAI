// =====================================
// MediformAI Backend Server
// =====================================
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import pkg from "pg";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import { uploadToAzure } from "./utils/azureUpload.js";
import { convertPdfToImages } from "./utils/convertPdfToImages.js";
import fs from "fs";
import { getBlobSasUrl } from "./utils/azureSAS.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";



dotenv.config();
const { Pool } = pkg;

const app = express();

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
      // allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      console.warn("❌ Blocked by CORS:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
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

// ----------------------------------------------------------
// Helper: normalise "15/04/25" → "2025-04-15" for PostgreSQL
// ----------------------------------------------------------
function normalizeDate(value) {
  if (!value) return null;
  const cleaned = String(value).trim().replace(/[.,]/g, "/");
  const m = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) {
    console.warn("⚠️ Skipping unparsable date:", value);
    return null;
  }
  let [_, d, mth, y] = m;
  if (y.length === 2) y = `20${y}`;
  return `${y.padStart(4, "0")}-${mth.padStart(2, "0")}-${d.padStart(2, "0")}`;
}



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

    // ✅ Normalize all field keys to lowercase so lookups work everywhere
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

    // =====================================
    // Step 1: Upload file to Azure Blob
    // =====================================
    const fileBuffer = Buffer.from(
      fileData.includes(",") ? fileData.split(",")[1] : fileData,
      "base64"
    );
    const blobFileName = `${uuidv4()}-${filename}`;
    const fileUrl = await uploadToAzure(blobFileName, fileBuffer, contentType);
    console.log("✅ Uploaded to Azure:", fileUrl);

// =====================================
// Step 2: Send image to OpenAI for extraction
// =====================================
console.log("🧠 Sending image to OpenAI (chat/completions + gpt-4o)");

const openaiResponse = await fetch(
  "https://api.openai.com/v1/chat/completions",  // ✅ endpoint that supports images for gpt-4o
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",  // ✅ multimodal model
      messages: [
        {
          role: "user",
          content: [
            {
  type: "text",
  text: `
You are an expert medical form data extractor specializing in Maternity Case Records (MCR1).

Follow these additional rules for checkboxes and Yes/No fields:
- If you see or read the words "No", "Neg", "Negative" anywhere near a checkbox or option, output "No".
- Only output "Yes" if you clearly read the word "Yes", "Pos", "Positive", or see an obvious tick (✓) or cross (✗) mark.
- If a box is blank, faint, uncertain, or ambiguous, default to "No".

CRITICAL INSTRUCTIONS:
1. Look at the ACTUAL form carefully and read EXACTLY what is written (both printed and handwritten text)
2. Read the form from LEFT to RIGHT, TOP to BOTTOM
3. Pay special attention to tables - read each row completely from left to right before moving to the next row
4. For the "Obstetric and Neonatal History" table, read each column: Year, Gestation, Delivery, Weight, Sex, Outcome, Complications
5. Extract handwritten values EXACTLY as they appear - numbers, measurements, checkmarks, etc.
6. For checkboxes, if marked put "Yes", if empty put "No"

Analyze this medical form image and extract ALL visible text and form fields.

Return a JSON object matching this EXACT structure (include only sections that are visible on the form):

{
  "form_name": "Maternity Case Record (MCR1)",
  "sections": [
    {
      "section_name": "Header Identification",
      "fields": {
        "healthcare_worker_name": "",
        "clinic": "",
        "folder_number": "",
        "date": "",
        "patient_name": "",
        "age": "",
        "gravida": "",
        "para": "",
        "miscarriages": ""
      }
    },
    {
      "section_name": "Obstetric and Neonatal History",
      "fields": {
        "history_record_1_year": "",
        "history_record_1_gestation": "",
        "history_record_1_delivery": "",
        "history_record_1_weight": "",
        "history_record_1_sex": "",
        "history_record_1_outcome": "",
        "history_record_1_complications": "",
        "description_of_complications": ""
      }
    },
    {
      "section_name": "Medical and General History",
      "fields": {
        "hypertension": "",
        "diabetes": "",
        "cardiac": "",
        "asthma": "",
        "tuberculosis": "",
        "epilepsy": "",
        "mental_health_disorder": "",
        "hiv": "",
        "other_condition": "",
        "if_yes_give_detail": "",
        "family_history_twins": "",
        "family_history_diabetes": "",
        "family_history_tb": "",
        "family_history_congenital": "",
        "family_history_details": "",
        "medication": "",
        "operations": "",
        "allergies": "",
        "tb_symptom_screen": "",
        "use_of_herbal_medicine": "",
        "use_of_otc_drugs": "",
        "alcohol_use": "",
        "tobacco_use": "",
        "substance_use": "",
        "psychosocial_risk_factors": ""
      }
    },
    {
      "section_name": "Examination",
      "fields": {
        "bp": "",
        "urine": "",
        "height": "",
        "weight": "",
        "muac": "",
        "bmi": "",
        "thyroid": "",
        "breasts": "",
        "heart": "",
        "lungs": "",
        "abdomen": "",
        "sf_measurement_at_booking": ""
      }
    },
    {
      "section_name": "Vaginal Examination",
      "fields": {
        "permission_obtained": "",
        "vulva_and_vagina": "",
        "cervix": "",
        "uterus": "",
        "pap_smear_done": "",
        "pap_smear_result": ""
      }
    },
    {
      "section_name": "Investigations",
      "fields": {
        "syphilis_test_date": "",
        "syphilis_test_result": "",
        "repeat_syphilis_test_date": "",
        "repeat_syphilis_test_result": "",
        "syphilis_notes": "",
        "treatment_1": "",
        "treatment_2": "",
        "treatment_3": "",
        "treatment_notes": "",
        "rhesus": "",
        "antibodies": "",
        "hb": "",
        "hb_notes": "",
        "tetox_1": "",
        "tetox_2": "",
        "tetox_3": "",
        "tetox_notes": "",
        "urine_mcs_date": "",
        "urine_mcs_result": "",
        "urine_mcs_notes": "",
        "screening_for_gestational_diabetes": "",
        "screening_notes": "",
        "hiv_status_at_booking": "",
        "hiv_booking_on_art": "",
        "hiv_booking_date": "",
        "hiv_booking_result": "",
        "hiv_booking_declined": "",
        "hiv_retest_1_date": "",
        "hiv_retest_1_result": "",
        "hiv_retest_1_on_art": "",
        "hiv_retest_1_declined": "",
        "hiv_retest_2_date": "",
        "hiv_retest_2_result": "",
        "hiv_retest_2_on_art": "",
        "hiv_retest_2_declined": "",
        "hiv_retest_3_date": "",
        "hiv_retest_3_result": "",
        "hiv_retest_3_on_art": "",
        "hiv_retest_3_declined": "",
        "cd4": "",
        "art_initiated_on": "",
        "hiv_notes": "",
        "viral_load_1_date": "",
        "viral_load_1_result": "",
        "viral_load_2_date": "",
        "viral_load_2_result": "",
        "viral_load_3_date": "",
        "viral_load_3_result": "",
        "viral_load_notes": "",
        "other": "",
        "other_notes": ""
      }
    },
    {
      "section_name": "Gestational Age",
      "fields": {
        "lnmp": "",
        "certain": "",
        "sonar_date": "",
        "bpd": "",
        "hc": "",
        "ac": "",
        "fl": "",
        "crl": "",
        "placenta": "",
        "afi": "",
        "average_gestation": "",
        "singleton": "",
        "multiple_pregnancy": "",
        "intrauterine_pregnancy": "",
        "sf_measurement": "",
        "edd_method": "",
        "edd": ""
      }
    },
    {
      "section_name": "Mental Health",
      "fields": {
        "screening_performed": "",
        "score": "",
        "discussed_in_record": "",
        "referred_to": ""
      }
    },
    {
      "section_name": "Birth Companion",
      "fields": {
        "discussed": ""
      }
    },
    {
      "section_name": "Counselling",
      "fields": {
        "counselling_1_topic": "",
        "counselling_1_date_1": "",
        "counselling_1_date_2": "",
        "counselling_2_topic": "",
        "counselling_2_date_1": "",
        "counselling_2_date_2": ""
      }
    },
    {
      "section_name": "Future Contraception",
      "fields": {
        "implant": "",
        "iud": "",
        "tubal_ligation": "",
        "oral": "",
        "counselling_done": "",
        "educational_material_given": "",
        "assessment_of_risk_done_by": ""
      }
    },
    {
      "section_name": "Footer",
      "fields": {
        "healthcare_worker_signature": "",
        "date_of_assessment": "",
        "notes": ""
      }
    }
  ]
}

EXTRACTION RULES:
- Use the exact field names shown above
- Extract EVERY visible value - both typed and handwritten text
- For checkboxes: marked = "Yes", empty = "No"
- For empty fields: use empty string ""
- Preserve dates as DD/MM/YYYY format
- Preserve measurements with units (e.g., "3.9 kg", "120/80")
- For the Obstetric History TABLE: read each complete row left to right (Year → Gestation → Delivery → Weight → Sex → Outcome → Complications)
- Number multiple history records sequentially (History Record 1, History Record 2, etc.)
- Only include sections visible on this page

TABLE EXTRACTION EXAMPLES:

1. Obstetric History table row:
If the table shows: "2008 | C/S | 3.9 kg | M | A | Total debrid"
Extract as:
"history_record_1_year": "2008"
"history_record_1_gestation": "C/S"
"history_record_1_delivery": ""
"history_record_1_weight": "3.9 kg"
"history_record_1_sex": "M"
"history_record_1_outcome": "A"
"history_record_1_complications": "Total debrid"

2. Counselling table:
If the table shows rows like:
"Fetal movements | ✓ | 15/5/24"
"Nutrition | 20/5/24 | -"
Extract as:
"counselling_1_topic": "Fetal movements"
"counselling_1_date_1": "✓"
"counselling_1_date_2": "15/5/24"
"counselling_2_topic": "Nutrition"
"counselling_2_date_1": "20/5/24"
"counselling_2_date_2": "-"


Return ONLY valid JSON, no additional text or explanations.`,
            },
            {
              type: "image_url",
              image_url: { url: fileUrl },

              },
          ],
        },
      ],
      max_tokens: 3000,
    }),
  }
);


// =====================================
// Step 3: Parse JSON safely (robust version)
// =====================================
if (!openaiResponse.ok) {
  const err = await openaiResponse.text();
  throw new Error(`OpenAI API error: ${err}`);
}

let extractedText = "{}";
let extracted = {};

try {
  const openaiData = await openaiResponse.json();
  extractedText = openaiData.choices?.[0]?.message?.content || "{}";

  console.log("🔍 Raw OpenAI output:\n", extractedText);

  // Try to isolate JSON and parse
  const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
  extracted = JSON.parse(jsonMatch ? jsonMatch[0] : extractedText);

  // ✅ Normalize all section field keys to lowercase once
if (Array.isArray(extracted.sections)) {
  extracted.sections = extracted.sections.map(sec => {
    const lowerFields = normalizeFieldKeys(sec.fields);

    // 🔹 Create a Proxy so lookups like ["BP"] or ["bp"] both work
    const caseInsensitive = new Proxy(lowerFields, {
      get(target, name) {
        if (typeof name === "string") {
          const lower = name.toLowerCase();
          return target[lower];
        }
        return undefined;
      },
    });

    return { ...sec, fields: caseInsensitive };
  });
}



} catch (err) {
  console.error("⚠️ JSON parse error:", err);
  console.log("⚠️ Raw text that failed to parse:\n", extractedText);

  // Fallback so uploads still succeed
  extracted = {
    form_name: "Extracted Form (Unparsed)",
    sections: [
      {
        section_name: "Raw OCR Output",
        fields: { raw_text: extractedText || "No readable data returned by model." },
      },
    ],
  };
}

// ✅ Helper: run DB queries and log any SQL errors
async function safeQuery(sql, params, label) {
  try {
    await pool.query(sql, params);
  } catch (err) {
    console.error(`❌ DB error in ${label}:`, err.message);
  }
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
        patient_name, age, gravida, para, miscarriages,
        upload_date
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    `;

    await pool.query(insertFormQuery, [
      formId,
      filename,
      fileUrl,
      contentType,
      header["healthcare_worker_name"] || null,
      header["clinic"] || null,
      header["folder_number"] || null,
      header["patient_name"] || null,
      header["age"] || null,
      header["gravida"] || null,
      header["para"] || null,
      header["miscarriages"] || null,
      uploadedAt,
    ]);



// =====================================
// Step 4b: Extract Medical & General History fields
// =====================================
const medical = normalizeFieldKeys(
  extracted.sections?.find((s) => s.section_name === "Medical and General History")?.fields || {}
);


  // --- Normalize Family History keys so they match the DB/UI field names ---
for (const key of Object.keys(medical)) {
  if (key.toLowerCase().startsWith("family history")) {
    const shortKey = key
      .replace(/Family History\s*/i, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_"); // e.g. "Family History Twins" → "twins"
    medical[`family_history_${shortKey}`] = medical[key];
    delete medical[key];
  }
}

// ✅ MEDICAL HISTORY
await pool.query(
  `
  UPDATE forms SET
    hypertension = $2, diabetes = $3, cardiac = $4, asthma = $5,
    tuberculosis = $6, epilepsy = $7, mental_health_disorder = $8,
    hiv = $9, other_condition = $10,
    family_history_diabetes = $11, family_history_tb = $12,
    family_history_genetic = $13, family_history_other = $14,
    medication = $15, operations = $16, allergies = $17,
    tb_symptom_screen = $18, alcohol_use = $19,
    tobacco_use = $20, substance_use = $21,
    psychosocial_risk_factors = $22
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
    normalizeYN(medical["mental_health_disorder"]), // underscore not space
    normalizeYN(medical["hiv"]),
    medical["other_condition"] || null,             // fixed spelling
    normalizeYN(medical["family_history_diabetes"]),
    normalizeYN(medical["family_history_tb"]),
    normalizeYN(medical["family_history_genetic"]),
    medical["family_history_other"] || null,
    medical["medication"] || null,
    medical["operations"] || null,
    medical["allergies"] || null,
    medical["tb_symptom_screen"] || null,
    normalizeYN(medical["alcohol_use"]),
    normalizeYN(medical["tobacco_use"]),
    normalizeYN(medical["substance_use"]),
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
    bp = $2, urine = $3, height = $4, weight = $5, muac = $6, bmi = $7,
    thyroid = $8, breasts = $9, heart = $10, lungs = $11, abdomen = $12,
    sf_measurement_at_booking = $13
  WHERE id = $1
  `,
  [
    formId,
    exam["bp"] || null,
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
// Step 4e: Gestational Age
// =====================================
const gestation = normalizeFieldKeys(
  extracted.sections?.find((s) => s.section_name === "Gestational Age")?.fields || {}
);

await pool.query(
  `
  UPDATE forms SET
    lnmp = $2, certain = $3, sonar_date = $4,
    bpd = $5, hc = $6, ac = $7, fl = $8, crl = $9,
    placenta = $10, afi = $11, average_gestation = $12,
    singleton = $13, multiple_pregnancy = $14, intrauterine_pregnancy = $15,
    sf_measurement = $16, edd_method = $17, edd = $18
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
    normalizeYN(gestation["singleton"]),
    normalizeYN(gestation["multiple_pregnancy"]),
    normalizeYN(gestation["intrauterine_pregnancy"]),
    gestation["sf_measurement"] || null,
    gestation["edd_method"] || null,
    gestation["edd"] || null,
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
// Step 4h: Future Contraception
// =====================================
const contraception = normalizeFieldKeys(
  extracted.sections?.find((s) => s.section_name === "Future Contraception")?.fields || {}
);

await pool.query(
  `
  UPDATE forms SET
    dual_protection = $2, implant = $3, inject = $4, iud = $5,
    tubal_ligation = $6, oral = $7,
    counselling_done = $8, educational_material_given = $9,
    assessment_of_risk_done_by = $10
  WHERE id = $1
  `,
  [
    formId,
    normalizeYN(contraception["dual_protection"]),
    normalizeYN(contraception["implant"]),
    normalizeYN(contraception["inject"]),
    normalizeYN(contraception["iud"]),
    normalizeYN(contraception["tubal_ligation"]),
    normalizeYN(contraception["oral"]),
    normalizeYN(contraception["counselling_done"]),
    normalizeYN(contraception["educational_material_given"]),
    contraception["assessment_of_risk_done_by"] || null,
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
    booking_done_by = $2, booking_date = $3,
    education_given = $4, management_plan = $5
  WHERE id = $1
  `,
  [
    formId,
    booking["booking_done_by"] || null,
    booking["booking_date"] || null,
    normalizeYN(booking["education_given"]),
    booking["management_plan"] || null,
  ]
);

// =====================================
// Step 4j: Footer
// =====================================
const footer = normalizeFieldKeys(
  extracted.sections?.find((s) => s.section_name === "Footer")?.fields || {}
);

await pool.query(
  `
  UPDATE forms SET
    healthcare_worker_signature = $2,
    date_of_assessment = $3,
    notes = $4
  WHERE id = $1
  `,
  [
    formId,
    footer["healthcare_worker_signature"] || null,
    footer["date_of_assessment"] || null,
    footer["notes"] || null,
  ]
);


    // =====================================
// Step 5: Handle repeating sections
// =====================================

// ---- Obstetric and Neonatal History ----
const obstetricSection = extracted.sections?.find(
  (s) => s.section_name === "Obstetric and Neonatal History"
);

const obstetric = normalizeFieldKeys(obstetricSection?.fields || {});

// ✅ Build records dynamically
const obstetricRecords = Object.entries(obstetric).reduce((acc, [key, val]) => {
  // Match keys like "history_record_1_year", "history_record_1_weight", etc.
  const match = key.match(/^history_record_(\d+)_(\w+)$/i);
  if (match) {
    const [_, num, field] = match;
    if (!acc[num]) acc[num] = { record_number: parseInt(num), form_id: formId };
    acc[num][field] = val;
  }
  return acc;
}, {});

// ✅ Extract the free-text field for “description_of_complications”
const descriptionOfComplications =
  obstetric["description_of_complications"] ||
  obstetric["description_of_complication"] ||
  obstetric["complications_description"] ||
  null;

// ✅ Insert each obstetric/neonatal record
for (const record of Object.values(obstetricRecords)) {
  await pool.query(
    `
    INSERT INTO obstetric_neonatal_history
      (id, form_id, record_number, year, gestation, delivery,
       weight, sex, outcome, complications, description_of_complications)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `,
    [
      uuidv4(),
      formId,
      record.record_number,
      record.year || null,
      record.gestation || null,
      record.delivery || null,
      record.weight || null,
      record.sex || null,
      record.outcome || null,
      record.complications || null,
      descriptionOfComplications || null,
    ]
  );
}

    // ---- Investigations ----
// ---- Investigations ----
const investigations =
  extracted.sections?.find((s) => s.section_name === "Investigations")?.fields || {};

await pool.query(
  `INSERT INTO investigations (
     id, form_id,
     syphilis_test_date, syphilis_test_result,
     repeat_syphilis_test_date, repeat_syphilis_test_result,
     syphilis_notes,
     treatment_1, treatment_2, treatment_3, treatment_notes,
     rhesus, antibodies,
     hb, hb_notes,
     tetox_1, tetox_2, tetox_3, tetox_notes,
     urine_mcs_date, urine_mcs_result, urine_mcs_notes,
     screening_for_gestational_diabetes, screening_notes,
     hiv_status_at_booking, hiv_booking_on_art,
     hiv_booking_date, hiv_booking_result, hiv_booking_declined,
     hiv_retest_1_date, hiv_retest_1_result, hiv_retest_1_on_art, hiv_retest_1_declined,
     hiv_retest_2_date, hiv_retest_2_result, hiv_retest_2_on_art, hiv_retest_2_declined,
     hiv_retest_3_date, hiv_retest_3_result, hiv_retest_3_on_art, hiv_retest_3_declined,
     cd4, art_initiated_on, hiv_notes,
     viral_load_1_date, viral_load_1_result,
     viral_load_2_date, viral_load_2_result,
     viral_load_3_date, viral_load_3_result, viral_load_notes,
     other, other_notes
   )
   VALUES (
     $1,$2,
     $3,$4,
     $5,$6,
     $7,
     $8,$9,$10,$11,
     $12,$13,
     $14,$15,
     $16,$17,$18,$19,
     $20,$21,$22,
     $23,$24,
     $25,$26,
     $27,$28,$29,
     $30,$31,$32,$33,
     $34,$35,$36,$37,
     $38,$39,$40,$41,
     $42,$43,$44,
     $45,$46,
     $47,$48,
     $49,$50,$51,
     $52,$53
   )`,
  [
    uuidv4(),
    formId,

    // Syphilis
    normalizeDate(investigations["syphilis_test_date"]),
    investigations["syphilis_test_result"],
    normalizeDate(investigations["repeat_syphilis_test_date"]),
    investigations["repeat_syphilis_test_result"],
    investigations["syphilis_notes"],

    // Treatment
    investigations["treatment_1"],
    investigations["treatment_2"],
    investigations["treatment_3"],
    investigations["treatment_notes"],

    // Blood group & antibodies
    investigations["rhesus"],
    investigations["antibodies"],

    // Hb
    investigations["hb"],
    investigations["hb_notes"],

    // Tetox
    investigations["tetox_1"],
    investigations["tetox_2"],
    investigations["tetox_3"],
    investigations["tetox_notes"],

    // Urine MCS
    normalizeDate(investigations["urine_mcs_date"]),
    investigations["urine_mcs_result"],
    investigations["urine_mcs_notes"],

    // Gestational Diabetes
    investigations["screening_for_gestational_diabetes"],
    investigations["screening_notes"],

    // HIV Booking
    investigations["hiv_status_at_booking"],
    normalizeYN(investigations["hiv_booking_on_art"]),
    normalizeDate(investigations["hiv_booking_date"]),
    investigations["hiv_booking_result"],
    normalizeYN(investigations["hiv_booking_declined"]),

    // HIV Re-tests 1–3
    normalizeDate(investigations["hiv_retest_1_date"]),
    investigations["hiv_retest_1_result"],
    normalizeYN(investigations["hiv_retest_1_on_art"]),
    normalizeYN(investigations["hiv_retest_1_declined"]),
    normalizeDate(investigations["hiv_retest_2_date"]),
    investigations["hiv_retest_2_result"],
    normalizeYN(investigations["hiv_retest_2_on_art"]),
    normalizeYN(investigations["hiv_retest_2_declined"]),
    normalizeDate(investigations["hiv_retest_3_date"]),
    investigations["hiv_retest_3_result"],
    normalizeYN(investigations["hiv_retest_3_on_art"]),
    normalizeYN(investigations["hiv_retest_3_declined"]),

    // CD4 & ART
    investigations["cd4"],
    normalizeDate(investigations["art_initiated_on"]),
    investigations["hiv_notes"],

    // Viral Loads
    normalizeDate(investigations["viral_load_1_date"]),
    investigations["viral_load_1_result"],
    normalizeDate(investigations["viral_load_2_date"]),
    investigations["viral_load_2_result"],
    normalizeDate(investigations["viral_load_3_date"]),
    investigations["viral_load_3_result"],
    investigations["viral_load_notes"],

    // Other
    investigations["other"],
    investigations["other_notes"]
  ]
);

    

    // ---- Counselling ----
const counselling =
  extracted.sections?.find((s) => s.section_name === "Counselling")?.fields || {};

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

// ✅ Insert each counselling record
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
      normalizeDate(record.date_1),
      normalizeDate(record.date_2),
    ]
  );
}


    // =====================================
    // Step 6: Done
    // =====================================
    res.json({
      success: true,
      form_id: formId,
      file_url: fileUrl,
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
      `SELECT id, form_id,
              syphilis_test_date, syphilis_test_result,
              repeat_syphilis_test_date, repeat_syphilis_test_result,
              syphilis_notes,
              treatment_1, treatment_2, treatment_3, treatment_notes,
              rhesus, antibodies,
              hb, hb_notes,
              tetox_1, tetox_2, tetox_3, tetox_notes,
              urine_mcs_date, urine_mcs_result, urine_mcs_notes,
              screening_for_gestational_diabetes, screening_notes,
              hiv_status_at_booking, hiv_booking_on_art,
              hiv_booking_date, hiv_booking_result, hiv_booking_declined,
              hiv_retest_1_date, hiv_retest_1_result, hiv_retest_1_on_art, hiv_retest_1_declined,
              hiv_retest_2_date, hiv_retest_2_result, hiv_retest_2_on_art, hiv_retest_2_declined,
              hiv_retest_3_date, hiv_retest_3_result, hiv_retest_3_on_art, hiv_retest_3_declined,
              cd4, art_initiated_on, hiv_notes,
              viral_load_1_date, viral_load_1_result,
              viral_load_2_date, viral_load_2_result,
              viral_load_3_date, viral_load_3_result, viral_load_notes,
              other, other_notes
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
        { section_name: "Investigations", fields: investigationsQ.rows[0] || {} },
        { section_name: "Medical and General History", fields: form || {} },
        { section_name: "Examination", fields: form || {} },
        { section_name: "Vaginal Examination", fields: form || {} },
        { section_name: "Gestational Age", fields: form || {} },
        { section_name: "Mental Health", fields: form || {} },
        { section_name: "Future Contraception", fields: form || {} }
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
        "healthcare_worker_name","clinic","folder_number","form_date",
        "patient_name","age","gravida","para","miscarriages",
        "hypertension","diabetes","cardiac","asthma","tuberculosis","epilepsy",
        "mental_health_disorder","hiv","other_condition",
        "family_history_diabetes","family_history_tb","family_history_genetic","family_history_other",
        "medication","operations","allergies","tb_symptom_screen",
        "alcohol_use","tobacco_use","substance_use","psychosocial_risk_factors",
        "bp","urine","height","weight","muac","bmi","thyroid","breasts","heart","lungs","abdomen","sf_measurement_at_booking",
        "permission_obtained","vulva_and_vagina","cervix","uterus","pap_smear_done","pap_smear_result",
        "lnmp","certain","sonar_date","bpd","hc","ac","fl","crl","placenta","afi","average_gestation",
        "singleton","multiple_pregnancy","intrauterine_pregnancy","sf_measurement","edd_method","edd",
        "screening_performed","mental_health_score","discussed_in_record","referred_to",
        "discussed",
        "implant","iud","tubal_ligation","oral",
        "counselling_done","educational_material_given","assessment_of_risk_done_by",
        "healthcare_worker_signature","date_of_assessment","notes"
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
      `INSERT INTO investigations (
         id, form_id,
         syphilis_test_date, syphilis_test_result,
         repeat_syphilis_test_date, repeat_syphilis_test_result,
         syphilis_notes,
         treatment_1, treatment_2, treatment_3, treatment_notes,
         rhesus, antibodies,
         hb, hb_notes,
         tetox_1, tetox_2, tetox_3, tetox_notes,
         urine_mcs_date, urine_mcs_result, urine_mcs_notes,
         screening_for_gestational_diabetes, screening_notes,
         hiv_status_at_booking, hiv_booking_on_art,
         hiv_booking_date, hiv_booking_result, hiv_booking_declined,
         hiv_retest_1_date, hiv_retest_1_result, hiv_retest_1_on_art, hiv_retest_1_declined,
         hiv_retest_2_date, hiv_retest_2_result, hiv_retest_2_on_art, hiv_retest_2_declined,
         hiv_retest_3_date, hiv_retest_3_result, hiv_retest_3_on_art, hiv_retest_3_declined,
         cd4, art_initiated_on, hiv_notes,
         viral_load_1_date, viral_load_1_result,
         viral_load_2_date, viral_load_2_result,
         viral_load_3_date, viral_load_3_result, viral_load_notes,
         other, other_notes
       )
       VALUES (
         $1,$2,
         $3,$4,
         $5,$6,
         $7,
         $8,$9,$10,$11,
         $12,$13,
         $14,$15,
         $16,$17,$18,$19,
         $20,$21,$22,
         $23,$24,
         $25,$26,
         $27,$28,$29,
         $30,$31,$32,$33,
         $34,$35,$36,$37,
         $38,$39,$40,$41,
         $42,$43,$44,
         $45,$46,
         $47,$48,
         $49,$50,$51,
         $52,$53
       )`,
      [
        row.id || uuidv4(), id,

        normalizeDate(row.syphilis_test_date),
        row.syphilis_test_result ?? null,
        normalizeDate(row.repeat_syphilis_test_date),
        row.repeat_syphilis_test_result ?? null,
        row.syphilis_notes ?? null,

        row.treatment_1 ?? null,
        row.treatment_2 ?? null,
        row.treatment_3 ?? null,
        row.treatment_notes ?? null,

        row.rhesus ?? null,
        row.antibodies ?? null,

        row.hb ?? null,
        row.hb_notes ?? null,

        row.tetox_1 ?? null,
        row.tetox_2 ?? null,
        row.tetox_3 ?? null,
        row.tetox_notes ?? null,

        normalizeDate(row.urine_mcs_date),
        row.urine_mcs_result ?? null,
        row.urine_mcs_notes ?? null,

        row.screening_for_gestational_diabetes ?? null,
        row.screening_notes ?? null,

        row.hiv_status_at_booking ?? null,
        normalizeYN(row.hiv_booking_on_art),
        normalizeDate(row.hiv_booking_date),
        row.hiv_booking_result ?? null,
        normalizeYN(row.hiv_booking_declined),

        normalizeDate(row.hiv_retest_1_date),
        row.hiv_retest_1_result ?? null,
        normalizeYN(row.hiv_retest_1_on_art),
        normalizeYN(row.hiv_retest_1_declined),

        normalizeDate(row.hiv_retest_2_date),
        row.hiv_retest_2_result ?? null,
        normalizeYN(row.hiv_retest_2_on_art),
        normalizeYN(row.hiv_retest_2_declined),

        normalizeDate(row.hiv_retest_3_date),
        row.hiv_retest_3_result ?? null,
        normalizeYN(row.hiv_retest_3_on_art),
        normalizeYN(row.hiv_retest_3_declined),

        row.cd4 ?? null,
        normalizeDate(row.art_initiated_on),
        row.hiv_notes ?? null,

        normalizeDate(row.viral_load_1_date),
        row.viral_load_1_result ?? null,
        normalizeDate(row.viral_load_2_date),
        row.viral_load_2_result ?? null,
        normalizeDate(row.viral_load_3_date),
        row.viral_load_3_result ?? null,
        row.viral_load_notes ?? null,

        row.other ?? null,
        row.other_notes ?? null
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
    try { await client.query("ROLLBACK"); } catch {}
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

// ✅ Example: GET /api/files/pdf-uploads/MCR1-page1.png
app.get("/api/files/:container/:filename", async (req, res) => {
  try {
    const { container, filename } = req.params;
    const containerClient = blobService.getContainerClient(container);
    const blobClient = containerClient.getBlobClient(filename);

    // Try to get blob metadata to set content type
    const props = await blobClient.getProperties();
    res.setHeader("Content-Type", props.contentType || "application/octet-stream");

    // Stream the file directly to browser
    const downloadResponse = await blobClient.download();
    downloadResponse.readableStreamBody.pipe(res);
  } catch (err) {
    console.error("❌ Error serving blob:", err.message);
    if (err.statusCode === 404) {
      res.status(404).send("File not found in Azure Blob Storage.");
    } else {
      res.status(500).send("Error fetching file from Azure.");
    }
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
app.get("/api/forms/:formId/issues", async (req, res) => {
  const { formId } = req.params;
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
