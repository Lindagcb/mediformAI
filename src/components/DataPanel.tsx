import React, { useEffect, useState } from "react";
import { Save, Trash2,Loader2, CheckCircle, Plus, X } from "lucide-react";
import IssueFlagTrigger from "./IssueFlagTrigger";
interface DataPanelProps {
  formId: string;
}

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001/api";
const yesNo = ["Yes", "No", ""];

const DataPanel: React.FC<DataPanelProps> = ({ formId }) => {
  const [form, setForm] = useState<any>({});
  const [obstetric, setObstetric] = useState<any[]>([]);
  const [investigations, setInvestigations] = useState<any[]>([]);
  const [counselling, setCounselling] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [issues, setIssues] = useState<any[]>([]);
  const [isCompleted, setIsCompleted] = useState(false);



  // ---------------------- Load full form ----------------------
useEffect(() => {
  // always run this hook; just skip fetching if formId invalid
  if (!formId || formId === "null") {
    return; // ✅ safe early exit
  }

  const fetchForm = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/forms/${formId}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, // ✅ add JWT
        },
      });

      const data = await res.json();

      console.log("🧠 Full API response from backend:", data);

      // 🧩 Normalizer — keep original keys, don't strip `_test_`
      const normalizeKeys = (obj: Record<string, any>) => {
        const fixed: Record<string, any> = {};
        for (const [k, v] of Object.entries(obj || {})) {
          // lower-case + convert spaces to underscores; KEEP `_test_`
          const clean = k.trim().replace(/\s+/g, "_");
          const lower = clean.toLowerCase();
          let cleanedValue = v;

            if (typeof v === "string" && v.includes("T") && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
              cleanedValue = v.split("T")[0]; // keep only YYYY-MM-DD
            }

            fixed[lower] = cleanedValue;

          // optional: add a SECOND alias without `_test_` for old UI code
          if (lower.includes("_test_")) {
            fixed[lower.replace("_test_", "_")] = v;
          }
        }
        return fixed;
      };

      // ⬇️ keep this merge exactly like this
      const mergedSectionFields = (data.sections || []).reduce(
        (acc: Record<string, any>, section: any) => ({
          ...acc,
          ...normalizeKeys(section.fields || {}),
        }),
        {}
      );

      const mergedForm = {
        ...normalizeKeys(data.form),
        ...normalizeKeys(data.investigations?.[0] || {}),
        ...mergedSectionFields,
      };

      console.log("✅ Final merged form object (what UI sees):", mergedForm);

      // ✅ Set state for UI rendering
      // 🔧 Apply date normalisation
      const fixedForm = { ...mergedForm };

      for (const key in fixedForm) {
        if (key.includes("date")) {
          fixedForm[key] = simpleDateFix(fixedForm[key]);
        }
      }

      // ✅ Set state for UI rendering
      // ✅ Set state for UI rendering
      setForm(fixedForm);

      // ----------------------------------------------
      // 🔥 PAD OBSTETRIC ROWS SO USERS CAN ENTER MISSING DATA
      // ----------------------------------------------
      const MIN_OBSTETRIC_ROWS = 5;   // adjust if you want more (e.g., 10)
      let paddedObstetric = [...(data.obstetric || [])];

      while (paddedObstetric.length < MIN_OBSTETRIC_ROWS) {
        paddedObstetric.push({
          id: null,
          form_id: formId,
          record_number: paddedObstetric.length + 1,
          year: "",
          gestation: "",
          delivery: "",
          weight: "",
          sex: "",
          outcome: "",
          complications: "",
          description_of_complications: ""
        });
      }

      setObstetric(paddedObstetric);

      // ----------------------------------------------
      setInvestigations(data.investigations || []);

      // FIXED order of topics
      const FIXED_COUNSELLING_TOPICS = [
        "Fetal movements",
        "Parental preparedness",
        "Nutrition",
        "Danger signs",
        "HIV",
        "Mental health",
        "Alcohol",
        "Tobacco",
        "Substances",
        "Domestic violence",
        "Labour and birth preparedness",
        "Breast care",
        "Infant feeding"
      ];

      // Build perfect list aligned with record numbers
      const mergedCounselling = FIXED_COUNSELLING_TOPICS.map((topic, index) => {
        const row = (data.counselling || []).find(
          r => r.record_number === index + 1
        );

        return {
          record_number: index + 1,
          topic,
          date_1: row?.date_1 || "",
          date_2: row?.date_2 || ""
        };
      });

      setCounselling(mergedCounselling);





      setIsCompleted(!!data.form?.is_completed);

    } catch (err) {
      console.error("❌ Error loading form:", err);
    } finally {
      setLoading(false);
    }
  };

  // ✅ call the async function
  fetchForm();
}, [formId]);


useEffect(() => {
  // 🚫 Prevent any API call if formId is null, undefined, or "null"
  if (!formId || formId === "null") {
    setIssues([]); // ensure issues is always an array
    return;
  }

  const fetchIssues = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/forms/${formId}/issues`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      // Ensure issues is always an array to avoid `.filter` crashing
      setIssues(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("❌ Error loading issues:", err);
      setIssues([]); // fallback to safe empty list
    }
  };

  fetchIssues();
}, [formId]);




  // ---------------------- Field helpers ----------------------
  const updateForm = (patch: Record<string, any>) =>
    setForm((prev: any) => ({ ...prev, ...patch }));

  const field = (
  label: string,
  value: string | undefined,
  onChange: (v: string) => void
) => (
  <div>
    <label className="block text-xs font-semibold text-gray-700 mb-1">
      {label}
    </label>
    <input
      disabled={isCompleted} // ✅ disable if form is completed
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full px-3 py-1.5 text-sm border border-[#008A80] Border rounded-lg focus:ring-2 focus:ring-[#008A80] text-gray-900
  ${isCompleted ? "bg-gray-100 text-gray-500 cursor-not-allowed" : ""}`}

    />
  </div>
);

// GLOBAL pos/neg helper
const posNegField = (
  label: string,
  value: string | undefined,
  onChange: (v: string) => void
) => {
  const options = ["Pos", "Neg", "-"];
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs font-semibold text-gray-700">{label}</label>
      <div className="flex gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`px-2 py-0.5 text-xs font-semibold rounded ${
              value === opt
                ? opt === "Pos"
                  ? "bg-green-600 text-white"
                  : "bg-red-600 text-white"
                : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
};

const hivResultField = (label, value, onChange) => {
  const options = ["Pos", "Neg", "Declined", ""];

  return (
    <div className="flex items-center gap-1">
      {label && (
        <label className="text-xs font-semibold text-gray-700">{label}</label>
      )}
      {options.map((opt) => (
        <button
          key={opt || "unset"}
          onClick={() => onChange(opt)}
          className={`px-2 py-0.5 text-xs font-semibold rounded border
            ${
              value === opt
                ? opt === "Pos"
                  ? "bg-green-600 text-white border-green-600"
                  : opt === "Neg"
                  ? "bg-red-600 text-white border-red-600"
                  : opt === "Declined"
                  ? "bg-yellow-600 text-white border-yellow-600"
                  : "bg-gray-500 text-white border-gray-500"
                : "bg-white text-gray-700 border-gray-300"
            }`}
        >
          {opt || "-"}
        </button>
      ))}
    </div>
  );
};


const hivStatusField = (
  label: string,
  value: string | undefined,
  onChange: (v: string) => void
) => {
  const options = ["Unknown", "Pos", "Neg", "Declined"];

  return (
    <div className="flex items-center justify-between">
      <label className="text-xs font-semibold text-gray-700">{label}</label>
      <div className="flex gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`px-2 py-0.5 text-xs font-semibold rounded border
              ${
                value === opt
                  ? opt === "Pos"
                    ? "bg-green-600 text-white"
                    : opt === "Neg"
                    ? "bg-red-600 text-white"
                    : opt === "Declined"
                    ? "bg-yellow-600 text-white"
                    : "bg-blue-600 text-white" // Unknown
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }
            `}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
};


// yes/no helper
  const yesNoField = (label: string, value: string | undefined, onChange: (v: string) => void) => (
    <div className="flex items-center justify-between">
      <label className="text-xs font-semibold text-gray-700">{label}</label>
      <div className="flex gap-1">
        {yesNo.map((opt) => (
          <button
            key={opt || "unset"}
            onClick={() => onChange(opt)}
            className={`px-2 py-0.5 text-xs font-semibold rounded ${
              value === opt
                ? opt === "Yes"
                  ? "bg-green-600 text-white"
                  : opt === "No"
                  ? "bg-red-600 text-white"
                  : "bg-gray-500 text-white"
                : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
            }`}
          >
            {opt || "-"}
          </button>
        ))}
      </div>
    </div>
  );

function simpleDateFix(value) {
  if (!value || typeof value !== "string") return value;

  // Remove brackets or notes, e.g. (GNR)
  value = value.replace(/\(.*?\)/g, "").trim();

  // Convert space-separated formats e.g. "07 10 25" → "07/10/25"
  if (/^\d{2}\s\d{2}\s\d{2}$/.test(value)) {
    const [d, m, y] = value.split(" ");
    return `${d}/${m}/20${y}`;
  }

  // Convert space-separated formats like "30 0125" or "30 01 25"
  if (/^\d{2}\s?\d{2}\s?\d{2}$/.test(value.replace(/\s+/g, ""))) {
    const cleaned = value.replace(/\s+/g, "");
    const d = cleaned.slice(0, 2);
    const m = cleaned.slice(2, 4);
    const y = cleaned.slice(4, 6);
    return `${d}/${m}/20${y}`;
  }

  // If already dd/mm/yyyy, keep it
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;

  // yyyy-mm-dd → dd/mm/yyyy
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }

  // dd/mm/yy → dd/mm/20yy
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(value)) {
    const [d, m, y] = value.split("/");
    return `${d}/${m}/20${y}`;
  }

  // dd-mm-yy or dd.mm.yy
  if (/^\d{2}[-.]\d{2}[-.]\d{2}$/.test(value)) {
    const parts = value.split(/[-.]/);
    return `${parts[0]}/${parts[1]}/20${parts[2]}`;
  }

  // ddmmyy → dd/mm/yyyy
  if (/^\d{6}$/.test(value)) {
    const d = value.slice(0, 2);
    const m = value.slice(2, 4);
    const y = value.slice(4, 6);
    return `${d}/${m}/20${y}`;
  }

  return value; // anything else stays unchanged
}




   // Generic cleaner: Numbers + dot + minus only.
// Used for BMI, Height, Weight, MUAC, SF Measurement.
function stripUnits(value) {
  if (typeof value !== "string") return value ?? "";
  return value.replace(/[^\d.-]/g, "").trim();
}





const fieldWithUnit = (
  label: string,
  value: string | undefined,
  unit: string,
  onChange: (v: string) => void
) => {
  const cleaned = stripUnits(value || "");

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">
        {label}
      </label>

      <div className="flex items-center gap-2">
        <input
          disabled={isCompleted}
          value={cleaned}
          onChange={(e) => onChange(stripUnits(e.target.value))}
          className={`w-full px-3 py-1.5 text-sm border border-[#008A80] Border rounded-lg focus:ring-2 focus:ring-[#008A80] text-gray-900
          ${isCompleted ? "bg-gray-100 text-gray-500 cursor-not-allowed" : ""}`}
        />
        <span className="text-xs text-gray-600 whitespace-nowrap">{unit}</span>
      </div>
    </div>
  );
};


 

  /// ---------------------- Save ----------------------
const handleSave = async () => {
  setSaving(true);
  setSaveSuccess(false);

  try {
    const token = localStorage.getItem("token");

    const payload = {
      form,
      obstetric,
      investigations: [
        {
          ...investigations[0],
          ...form,
        },
      ],
      counselling,
    };

    const res = await fetch(`${API_BASE}/forms/${formId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("❌ Save failed:", res.status, text);
      throw new Error("Save failed");
    }

    // ✅ THIS is your original popup
    alert("Saved successfully");

    // ✅ Keep your old visual success animation
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);

  } catch (err) {
    console.error("Error saving form:", err);
    alert("Save failed"); // same as before
  } finally {
    setSaving(false);
  }
};


const handleDelete = async () => {
  if (!confirm("Are you sure you want to delete this form? This cannot be undone.")) return;

  setDeleting(true);

  try {
    const token = localStorage.getItem("token");

    const res = await fetch(`${API_BASE}/forms/${formId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Delete failed:", res.status, errText);
      throw new Error("Failed to delete form");
    }

    alert("Form deleted successfully");
    window.location.reload();

  } catch (err) {
    console.error("Delete failed:", err);
    alert("Failed to delete form");
  } finally {
    setDeleting(false);
  }
};


const markAsCompleted = async () => {
  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE}/forms/${formId}/completed`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ is_completed: true }),
    });
    if (!res.ok) throw new Error("Failed");
    alert("✅ Form marked as completed!");
  } catch (err) {
    console.error("❌ Error marking completed:", err);
    alert("Error marking as completed.");
  }
};

const refreshIssues = async () => {
  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE}/forms/${formId}/issues`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    setIssues(data);
  } catch (err) {
    console.error("❌ Error refreshing issues:", err);
  }
};


const resolveIssue = async (issueId: string) => {
  try {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "{}");

    const res = await fetch(`${API_BASE}/forms/${formId}/issues/${issueId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        resolved: true,
        resolved_by: user.username || "system",
      }),
    });

    if (!res.ok) throw new Error("Failed to resolve issue");

    // ✅ Update local state so the issue disappears
    setIssues((prev) =>
      prev.map((x) => (x.id === issueId ? { ...x, resolved: true } : x))
    );

    alert("✅ Issue marked as resolved");
    setTimeout(() => window.dispatchEvent(new Event("refreshForms")), 200);
  } catch (err) {
    console.error("❌ Error resolving issue:", err);
    alert("Error marking issue as resolved");
  }
};





  // ---------------------- UI ----------------------
return (
  <div className="w-1/3 bg-white border-l border-[#008A80] Border flex flex-col">
    {/* Header bar with delete button */}
    <div className="px-4 py-3 border-b border-gray-200 bg-white">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">
          Extracted Form Data
        </h3>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50"
          title="Delete form"
        >
          {deleting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </button>
      </div>
      <p className="text-xs text-gray-500">
        {form.file_name || "Form"} •{" "}
        {(obstetric?.length || 0) +
          (investigations?.length || 0) +
          (counselling?.length || 0)}{" "}
        table rows
      </p>
    </div>

    {/* Scrollable content — always show form */}
<div className="flex-1 overflow-y-auto p-4 space-y-6">
  {isCompleted && (
    <div className="mb-4 text-center">
      <p className="text-green-700 font-semibold">
        ✅ This form has been marked as completed
      </p>
      <p className="text-gray-600 text-sm">
        It is now read-only and cannot be edited.
      </p>
    </div>
  )}
      {/* ============================================================= */}
          {/*  A. FACILITY INFORMATION  */}
          {/* ============================================================= */}
          <section className="odd:bg-gray-50 even:bg-white p-4 rounded-lg">
          <h4 className="text-xs font-bold text-[#008A80] mb-3 uppercase tracking-wide flex justify-between items-center">
            <span>Facility Information</span>

            <IssueFlagTrigger
              section="Facility Information"
              formId={formId}
              onSaved={refreshIssues}
            >
              <button
                className="text-[10px] text-amber-600 hover:text-amber-700 font-normal flex items-center gap-1"
              >
                ⚠️ Flag Issue
              </button>
            </IssueFlagTrigger>
          </h4>

          {/* === Display unresolved issues for this section === */}
          {issues
            .filter((i) => i.section_name === "Facility Information" && !i.resolved)
            .map((i) => (
              <div
                key={i.id}
                className="bg-amber-50 border-l-4 border-amber-500 p-2 mb-2 rounded text-[13px] text-amber-800"
              >
                ⚠️ {i.issue_description}

                {i.created_by && (
                  <div className="text-[10px] text-amber-600 mt-1">
                    Reported by {i.created_by}
                  </div>
                )}

                <button
                  onClick={() => resolveIssue(i.id)}
                  className="mt-1 text-[10px] text-blue-600 hover:underline"
                >
                  Mark resolved
                </button>
              </div>
            ))}

          <div className="grid grid-cols-3 gap-3">
            {field("Healthcare Worker Name", form.healthcare_worker_name, (v) =>
              updateForm({ healthcare_worker_name: v })
            )}

            {field("Clinic", form.clinic, (v) => updateForm({ clinic: v }))}

            {field("Clinic Date", form.clinic_date, (v) =>
              updateForm({ clinic_date: v })
            )}
          </div>
        </section>


          {/* ============================================================= */}
            {/*  B. GENERAL PATIENT INFORMATION */}
            {/* ============================================================= */}
            <section className="odd:bg-gray-50 even:bg-white p-4 rounded-lg">
              <h4 className="text-xs font-bold text-[#008A80] mb-3 uppercase tracking-wide flex justify-between items-center">
                <span>General Information</span>

                <IssueFlagTrigger
                  section="General Information"
                  formId={formId}
                  onSaved={refreshIssues}
                >
                  <button
                    className="text-[10px] text-amber-600 hover:text-amber-700 font-normal flex items-center gap-1"
                  >
                    ⚠️ Flag Issue
                  </button>
                </IssueFlagTrigger>
              </h4>

              {/* === Display unresolved issues === */}
              {issues
                .filter((i) => i.section_name === "General Information" && !i.resolved)
                .map((i) => (
                  <div
                    key={i.id}
                    className="bg-amber-50 border-l-4 border-amber-500 p-2 mb-2 rounded text-[13px] text-amber-800"
                  >
                    ⚠️ {i.issue_description}
                    {i.created_by && (
                      <div className="text-[10px] text-amber-600 mt-1">
                        Reported by {i.created_by}
                      </div>
                    )}
                    <button
                      onClick={() => resolveIssue(i.id)}
                      className="mt-1 text-[10px] text-blue-600 hover:underline"
                    >
                      Mark resolved
                    </button>
                  </div>
                ))}

             {/* ================= ROW 1 ================= */}
              <div className="grid grid-cols-3 gap-3">
                {/* Patient Name — wide */}
                <div className="col-span-2">
                  {field("Patient Name", form.patient_name, (v) =>
                    updateForm({ patient_name: v })
                  )}
                </div>

                {/* MomConnected toggle */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    MomConnected
                  </label>

                  <div className="flex gap-1">
                    {yesNo.map((opt) => (
                      <button
                        key={opt || "unset"}
                        onClick={() => updateForm({ mom_connected: opt })}
                        className={`px-2 py-0.5 text-xs font-semibold rounded ${
                          form.mom_connected === opt
                            ? opt === "Yes"
                              ? "bg-green-600 text-white"
                              : opt === "No"
                              ? "bg-red-600 text-white"
                              : "bg-gray-500 text-white"
                            : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        {opt || "-"}
                      </button>
                    ))}
                  </div>
                </div>

              </div>

                {/* Row 2: Folder Number + DOB + Age */}
                <div className="grid grid-cols-3 gap-3 mt-3">
                  {field("Folder Number", form.folder_number, (v) =>
                    updateForm({ folder_number: v })
                  )}

                  {field("Date of Birth", form.date_of_birth, (v) =>
                    updateForm({ date_of_birth: v })
                  )}

                  {field("Age", form.age, (v) =>
                    updateForm({ age: v })
                  )}
                </div>

                {/* Row 3: Gravida + Para + Miscarriages */}
                <div className="grid grid-cols-3 gap-3 mt-3">
                  {field("Gravida", form.gravida, (v) =>
                    updateForm({ gravida: v })
                  )}

                  {field("Para", form.para, (v) =>
                    updateForm({ para: v })
                  )}

                  {field("Miscarriages", form.miscarriages, (v) =>
                    updateForm({ miscarriages: v })
                  )}
                </div>

            </section>




        {/* 2️⃣ Obstetric & Neonatal History */}
        <section className="odd:bg-gray-50 even:bg-white p-4 rounded-lg">
          <h4 className="text-xs font-bold text-[#008A80]  mb-3 uppercase tracking-wide flex justify-between items-center">
          <span>Obstetric and Neonatal History</span>
          <IssueFlagTrigger
              section="Obstetric and Neonatal History"
              formId={formId}
              onSaved={refreshIssues}
            >
              <button
                className="text-[10px] text-amber-600 hover:text-amber-700 font-normal flex items-center gap-1"
              >
                ⚠️ Flag Issue
              </button>
            </IssueFlagTrigger>

        </h4>
        {/* === Display unresolved issues for this section === */}
{issues
  .filter((i) => i.section_name === "Obstetric and Neonatal History" && !i.resolved)
  .map((i) => (
    <div
      key={i.id}
      className="bg-amber-50 border-l-4 border-amber-500 p-2 mb-2 rounded text-[13px] text-amber-800"
    >
      ⚠️ {i.issue_description}
      {i.created_by && (
        <div className="text-[10px] text-amber-600 mt-1">
          Reported by {i.created_by}
        </div>
      )}
      <button
        onClick={async () => {
          const token = localStorage.getItem("token");
          await fetch(`${API_BASE}/forms/${formId}/issues/${i.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ resolved: true }),
          });
          setIssues((prev) =>
            prev.map((x) =>
              x.id === i.id ? { ...x, resolved: true } : x
            )
          );
        }}
        className="mt-1 text-[10px] text-blue-600 hover:underline"
      >
        Mark resolved
      </button>
    </div>
  ))}



  <div className="text-[#008A80] border border-[#008A80] Border rounded-lg p-2">
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="border-b border-[#008A80] Border">
          {[
            "#",
            "Year",
            "Gestation",
            "Delivery",
            "Weight",
            "Sex",
            "Outcome",
            "Complications",
          ].map((h) => (
            <th
              key={h}
              className="p-1 text-left text-[#008A80]  font-semibold"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {obstetric.map((r, i) => (
          <tr key={i} className="border-b border-[#008A80] Border">
            <td className="p-1 font-semibold text-[#008A80]">
              {r.record_number || i + 1}
            </td>
            {[
              "year",
              "gestation",
              "delivery",
              "weight",
              "sex",
              "outcome",
              "complications",
            ].map((f) => (
              <td
                key={f}
                className={
                  f === "year"
                    ? "p-1 w-20"          // ✅ wider year column
                    : f === "outcome"
                    ? "p-1 w-20"          // ✅ narrower outcome column
                    : "p-1"
                }
              >
                <input
                  value={r[f] || ""}
                  onChange={(e) =>
                    setObstetric((prev) =>
                      prev.map((row, idx) =>
                        idx === i ? { ...row, [f]: e.target.value } : row
                      )
                    )
                  }
                  className="w-full border border-[#008A80] Border rounded px-1 py-0.5 text-xs"
                  maxLength={f === "year" ? 4 : undefined} // optional, keeps it clean
                />
              </td>
            ))}

          </tr>
        ))}
      </tbody>
    </table>

    {/* ✅ New: Description of Complications */}
    <div className="mt-3">
      <label className="block text-[11px] font-semibold text-[#008A80]  mb-1">
        Descriptions of complications
      </label>
      <textarea
        value={obstetric[0]?.description_of_complications || ""}
        onChange={(e) =>
          setObstetric((prev) =>
            prev.map((row, idx) =>
              idx === 0
                ? { ...row, description_of_complications: e.target.value }
                : row
            )
          )
        }
        rows={3}
        placeholder=""
        className="w-full border border-[#008A80] Border rounded px-2 py-1 text-xs focus:ring-2 focus:ring-[#008A80]"
      />
      <p className="text-[10px] text-[#008A80] mt-1">
        Use this to elaborate on any complications noted in the table above.
      </p>
    </div>
  </div>
</section>



        {/* 3️⃣ Medical, General & Family History */}
        <section className="odd:bg-gray-50 even:bg-white p-4 rounded-lg">
              <h4 className="text-xs font-bold text-[#008A80]  mb-3 uppercase tracking-wide flex justify-between items-center">
              <span>Medical and General History</span>
              <IssueFlagTrigger
                  section="Medical and General History"
                  formId={formId}
                  onSaved={refreshIssues}
                >
                  <button
                    className="text-[10px] text-amber-600 hover:text-amber-700 font-normal flex items-center gap-1"
                  >
                    ⚠️ Flag Issue
                  </button>
                </IssueFlagTrigger>

            </h4>
            {/* === Display unresolved issues for this section === */}
{issues
  .filter((i) => i.section_name === "Medical, General and Family History" && !i.resolved)
  .map((i) => (
    <div
      key={i.id}
      className="bg-amber-50 border-l-4 border-amber-500 p-2 mb-2 rounded text-[13px] text-amber-800"
    >
      ⚠️ {i.issue_description}
      {i.created_by && (
        <div className="text-[10px] text-amber-600 mt-1">
          Reported by {i.created_by}
        </div>
      )}
      <button
        onClick={async () => {
          const token = localStorage.getItem("token");
          await fetch(`${API_BASE}/forms/${formId}/issues/${i.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ resolved: true }),
          });
          setIssues((prev) =>
            prev.map((x) =>
              x.id === i.id ? { ...x, resolved: true } : x
            )
          );
        }}
        className="mt-1 text-[10px] text-blue-600 hover:underline"
      >
        Mark resolved
      </button>
    </div>
  ))}


  <div className="space-y-3 text-[#008A80] border border-[#008A80] Border rounded-lg p-3">
    {/* --- Medical & General --- */}
    <div className="space-y-2">
      {[
        "hypertension",
        "diabetes",
        "cardiac",
        "asthma",
        "tuberculosis",
        "epilepsy",
        "mental_health_disorder",
        "hiv",
      ].map((f) =>
        yesNoField(
          f.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          form[f],
          (v) => updateForm({ [f]: v })
        )
      )}
      {field("Other Condition", form.other_condition, (v) =>
        updateForm({ other_condition: v })
      )}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          If yes, give detail
        </label>
        <textarea
          rows={2}
          value={form.other_condition_detail || ""}
          onChange={(e) =>
            updateForm({ other_condition_detail: e.target.value })
          }
          className="w-full px-3 py-1.5 text-sm border border-[#008A80] Border rounded-lg focus:ring-2 focus:ring-[#008A80] focus:border-[#008A80] resize-y text-gray-900"
        />
      </div>
    </div>

    {/* --- Family History --- */}
    <div className="space-y-2 pt-2 border-t border-[#008A80] Border">
      <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase">
        Family History
      </label>
      <div className="grid grid-cols-2 gap-3">
        {yesNoField("Twins", form.family_history_twins, (v) =>
          updateForm({ family_history_twins: v })
        )}
        {yesNoField("Diabetes", form.family_history_diabetes, (v) =>
          updateForm({ family_history_diabetes: v })
        )}
        {yesNoField("TB", form.family_history_tb, (v) =>
          updateForm({ family_history_tb: v })
        )}
        {yesNoField("Congenital", form.family_history_congenital, (v) =>
          updateForm({ family_history_congenital: v })
        )}
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Details
        </label>
        <textarea
          rows={2}
          value={form.family_history_details || ""}
          onChange={(e) =>
            updateForm({ family_history_details: e.target.value })
          }
          className="w-full px-3 py-1.5 text-sm border border-[#008A80] Border rounded-lg focus:ring-2 focus:ring-[#008A80] focus:border-[#008A80] resize-y"
        />
      </div>
    </div>

    {/* --- Remaining items --- */}
    <div className="space-y-2 pt-2 border-t border-[#008A80] Border">
      {field("Medication", form.medication, (v) =>
        updateForm({ medication: v })
      )}
      {field("Operations", form.operations, (v) =>
        updateForm({ operations: v })
      )}
      {field("Allergies", form.allergies, (v) =>
        updateForm({ allergies: v })
      )}
      {posNegField(
        "TB Symptom Screen",
        form.tb_symptom_screen,
        (v) => updateForm({ tb_symptom_screen: v })
      )}
      {yesNoField("Use of Herbal Medicine", form.use_of_herbal, (v) =>
        updateForm({ use_of_herbal: v })
      )}
      {yesNoField("Tobacco Use", form.tobacco_use, (v) =>
        updateForm({ tobacco_use: v })
      )}
      {yesNoField("Alcohol Use", form.alcohol_use, (v) =>
        updateForm({ alcohol_use: v })
      )}
      {yesNoField("Substance Use", form.substance_use, (v) =>
        updateForm({ substance_use: v })
      )}
      {yesNoField("Use of OTC Drugs", form.use_of_otc, (v) =>
        updateForm({ use_of_otc: v })
      )}
      {/* Type of substance used (client request) */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Type of substance used
          </label>
          <input
            disabled={isCompleted}
            value={form.type_of_substance_used || ""}
            onChange={(e) => updateForm({ type_of_substance_used: e.target.value })}
            className={`w-full px-3 py-1.5 text-sm border border-[#008A80] Border rounded-lg
              ${isCompleted ? "bg-gray-100 text-gray-500 cursor-not-allowed" : "bg-white"}`}
            placeholder=""
          />
        </div>
      {field(
        "Psychosocial Risk Factors",
        form.psychosocial_risk_factors,
        (v) => updateForm({ psychosocial_risk_factors: v })
      )}
    </div>
  </div>
</section>

        {/* 4️⃣ Examination */}
          <section className="odd:bg-gray-50 even:bg-white p-4 rounded-lg">
            <h4 className="text-xs font-bold text-[#008A80] mb-3 uppercase tracking-wide flex justify-between items-center">
            <span>Examination</span>
            <IssueFlagTrigger
              section="Examination"
              formId={formId}
              onSaved={refreshIssues}
            >
              <button
                className="text-[10px] text-amber-600 hover:text-amber-700 font-normal flex items-center gap-1"
              >
                ⚠️ Flag Issue
              </button>
            </IssueFlagTrigger>

          </h4>
            {/* === Display unresolved issues for this section === */}
              {issues
                .filter((i) => i.section_name === "Examination" && !i.resolved)
                .map((i) => (
                  <div
                    key={i.id}
                    className="bg-amber-50 border-l-4 border-amber-500 p-2 mb-2 rounded text-[13px] text-amber-800"
                  >
                    ⚠️ {i.issue_description}
                    {i.created_by && (
                      <div className="text-[10px] text-amber-600 mt-1">
                        Reported by {i.created_by}
                      </div>
                    )}
                    <button
                      onClick={async () => {
                        const token = localStorage.getItem("token");
                        await fetch(`${API_BASE}/forms/${formId}/issues/${i.id}`, {
                          method: "PATCH",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                          },
                          body: JSON.stringify({ resolved: true }),
                        });
                        setIssues((prev) =>
                          prev.map((x) =>
                            x.id === i.id ? { ...x, resolved: true } : x
                          )
                        );
                      }}
                      className="mt-1 text-[10px] text-blue-600 hover:underline"
                    >
                      Mark resolved
                    </button>
                  </div>
                ))}


              <div className="grid grid-cols-3 gap-4">
                {/* === Compact vital fields (unit-based) === */}
              <div className="flex flex-col">
                  <label className="text-xs font-semibold text-gray-700 mb-1">BP</label>

                  <div className="flex items-center gap-2">
                    {/* SYSTOLIC */}
                    <input
                      disabled={isCompleted}
                      value={form.bp || ""}
                      onChange={(e) => {
                        const systolic = e.target.value.replace(/[^\d]/g, "");
                        updateForm({ bp: systolic });
                      }}
                      className={`w-14 px-2 py-1 text-sm border border-[#008A80] rounded-lg
                        ${isCompleted ? "bg-gray-100 text-gray-500 cursor-not-allowed" : ""}`}
                      placeholder="120"
                    />

                    <span className="font-semibold text-gray-700">/</span>

                    {/* DIASTOLIC */}
                    <input
                      disabled={isCompleted}
                      value={form.bp_dia || ""}
                      onChange={(e) => {
                        const diastolic = e.target.value.replace(/[^\d]/g, "");
                        updateForm({ bp_dia: diastolic });
                      }}
                      className={`w-14 px-2 py-1 text-sm border border-[#008A80] rounded-lg
                        ${isCompleted ? "bg-gray-100 text-gray-500 cursor-not-allowed" : ""}`}
                      placeholder="70"
                    />

                    <span className="text-xs text-gray-600 whitespace-nowrap">mmHg</span>
                  </div>
                </div>



                <div className="max-w-[120px]">
                  {field("Urine", form.urine, (v) => updateForm({ urine: v }))}
                </div>

                <div className="max-w-[140px]">
                  {fieldWithUnit("Height", form.height, "cm", (v) =>
                    updateForm({ height: v })
                  )}
                </div>

                <div className="max-w-[140px]">
                  {fieldWithUnit("Weight", form.weight, "kg", (v) =>
                    updateForm({ weight: v })
                  )}
                </div>

                <div className="max-w-[140px]">
                  {fieldWithUnit("MUAC", form.muac, "cm", (v) =>
                    updateForm({ muac: v })
                  )}
                </div>

                <div className="max-w-[160px]">
                  {fieldWithUnit("BMI", form.bmi, "kg/m²", (v) =>
                    updateForm({ bmi: v })
                  )}
                </div>

                {/* === Larger clinical text fields === */}
                <div className="max-w-[240px]">
                  {field("THYROID", form.thyroid, (v) => updateForm({ thyroid: v }))}
                </div>

                <div className="max-w-[240px]">
                  {field("BREASTS", form.breasts, (v) => updateForm({ breasts: v }))}
                </div>

                <div className="max-w-[240px]">
                  {field("HEART", form.heart, (v) => updateForm({ heart: v }))}
                </div>

                <div className="max-w-[240px]">
                  {field("LUNGS", form.lungs, (v) => updateForm({ lungs: v }))}
                </div>

                <div className="max-w-[240px]">
                  {field("ABDOMEN", form.abdomen, (v) => updateForm({ abdomen: v }))}
                </div>

                <div className="max-w-[160px]">
                  {fieldWithUnit(
                  "SF MEASUREMENT AT BOOKING",
                  stripUnits(form.sf_measurement_at_booking),
                  "cm",
                  (v) => updateForm({ sf_measurement_at_booking: stripUnits(v) })
                )}
                </div>

              </div>

          </section>


        {/* 5️⃣ Vaginal Examination */}
          <section className="odd:bg-gray-50 even:bg-white p-4 rounded-lg">
            <h4 className="text-xs font-bold text-[#008A80] mb-3 uppercase tracking-wide flex justify-between items-center">
            <span>Vaginal Examination</span>
            <IssueFlagTrigger
              section="Vaginal Examination"
              formId={formId}
              onSaved={refreshIssues}
            >
              <button
                className="text-[10px] text-amber-600 hover:text-amber-700 font-normal flex items-center gap-1"
              >
                ⚠️ Flag Issue
              </button>
            </IssueFlagTrigger>

          </h4>
                {/* === Display unresolved issues for this section === */}
{issues
  .filter((i) => i.section_name === "Vaginal Examination" && !i.resolved)
  .map((i) => (
    <div
      key={i.id}
      className="bg-amber-50 border-l-4 border-amber-500 p-2 mb-2 rounded text-[13px] text-amber-800"
    >
      ⚠️ {i.issue_description}
      {i.created_by && (
        <div className="text-[10px] text-amber-600 mt-1">
          Reported by {i.created_by}
        </div>
      )}
      <button
        onClick={async () => {
          const token = localStorage.getItem("token");
          await fetch(`${API_BASE}/forms/${formId}/issues/${i.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ resolved: true }),
          });
          setIssues((prev) =>
            prev.map((x) =>
              x.id === i.id ? { ...x, resolved: true } : x
            )
          );
        }}
        className="mt-1 text-[10px] text-blue-600 hover:underline"
      >
        Mark resolved
      </button>
    </div>
  ))}


            <div className="grid grid-cols-2 gap-3">
              {field(
                "Permission Obtained",
                form.permission_obtained,
                (v) => updateForm({ permission_obtained: v })
              )}
              {field(
                "Vulva and Vagina",
                form.vulva_and_vagina,
                (v) => updateForm({ vulva_and_vagina: v })
              )}
              {field("Cervix", form.cervix, (v) => updateForm({ cervix: v }))}
              {field("Uterus", form.uterus, (v) => updateForm({ uterus: v }))}
              {yesNoField(
                "Pap Smear Done",
                form.pap_smear_done,
                (v) => updateForm({ pap_smear_done: v })
              )}
              {field(
                "Pap Smear Date",
                form.pap_smear_date,
                (v) => updateForm({ pap_smear_date: v })
              )}
              {field(
                "Pap Smear Result",
                form.pap_smear_result,
                (v) => updateForm({ pap_smear_result: v })
              )}
            </div>
          </section>


        {/* 6️⃣ Investigations (final corrected layout) */}
        <section className="odd:bg-gray-50 even:bg-white p-4 rounded-lg">
          <h4 className="text-xs font-bold text-[#008A80] mb-3 uppercase tracking-wide flex justify-between items-center">
          <span>Investigations</span>
          <IssueFlagTrigger
            section="Investigations"
            formId={formId}
            onSaved={refreshIssues}
          >
            <button
              className="text-[10px] text-amber-600 hover:text-amber-700 font-normal flex items-center gap-1"
            >
              ⚠️ Flag Issue
            </button>
          </IssueFlagTrigger>

        </h4>

        {/* === Display unresolved issues for this section === */}
            {issues
              .filter((i) => i.section_name === "Investigations" && !i.resolved)
              .map((i) => (
                <div
                  key={i.id}
                  className="bg-amber-50 border-l-4 border-amber-500 p-2 mb-2 rounded text-[13px] text-amber-800"
                >
                  ⚠️ {i.issue_description}
                  {i.created_by && (
                    <div className="text-[10px] text-amber-600 mt-1">
                      Reported by {i.created_by}
                    </div>
                  )}
                  <button
                    onClick={async () => {
                      const token = localStorage.getItem("token");
                      await fetch(`${API_BASE}/forms/${formId}/issues/${i.id}`, {
                        method: "PATCH",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({ resolved: true }),
                      });
                      setIssues((prev) =>
                        prev.map((x) =>
                          x.id === i.id ? { ...x, resolved: true } : x
                        )
                      );
                    }}
                    className="mt-1 text-[10px] text-blue-600 hover:underline"
                  >
                    Mark resolved
                  </button>
                </div>
              ))}


            <div className="text-[#008A80] border border-[#008A80] Border rounded-lg p-3 space-y-3">

            {/* Syphilis */}
            <div className="grid grid-cols-2 gap-3">
              {field("Syphilis Test Date", form.syphilis_test_date, (v) =>
                updateForm({ syphilis_test_date: v })
              )}

              {posNegField(
                "Syphilis Test Result",
                form.syphilis_test_result,
                (v) => updateForm({ syphilis_test_result: v })
              )}

              {field("Repeat Syphilis Test Date", form.repeat_syphilis_test_date, (v) =>
                updateForm({ repeat_syphilis_test_date: v })
              )}

              {posNegField(
                "Repeat Syphilis Test Result",
                form.repeat_syphilis_test_result,
                (v) => updateForm({ repeat_syphilis_test_result: v })
              )}
            </div>

            {/* Treatment 1–3 FIRST (client requirement) */}
            <div className="grid grid-cols-3 gap-3">
              {field("Treatment 1", form.treatment_1, (v) =>
                updateForm({ treatment_1: v })
              )}
              {field("Treatment 2", form.treatment_2, (v) =>
                updateForm({ treatment_2: v })
              )}
              {field("Treatment 3", form.treatment_3, (v) =>
                updateForm({ treatment_3: v })
              )}
            </div>

            {/* Rhesus / Antibodies */}
              <div className="grid grid-cols-2 gap-3">

                {/* Rhesus — pos/neg */}
                <div className="w-[140px]">
                  {posNegField(
                    "Rhesus",
                    form.rhesus,
                    (v) => updateForm({ rhesus: v })
                  )}
                </div>

                {/* Antibodies — yes/no */}
                <div className="w-[140px]">
                  {yesNoField(
                    "Antibodies",
                    form.antibodies,
                    (v) => updateForm({ antibodies: v })
                  )}
                </div>

              </div>


            {/* Hb moved AFTER Rhesus + Antibodies (client request) */}
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-gray-700 mb-1">Hb</label>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={form.hb || ""}
                  onChange={(e) => updateForm({ hb: e.target.value })}
                  className="w-20 border border-[#008A80] rounded-lg p-2"
                />
                <span className="text-xs font-semibold text-gray-700">g/dl</span>
              </div>
            </div>

            

           {/* Tet Tox (Tetanus Toxoid) */}
              <div className="grid grid-cols-3 gap-3">
                {field("Tet Tox 1st", form.tet_tox_1, (v) =>
                  updateForm({ tet_tox_1: v })
                )}
                {field("Tet Tox 2nd", form.tet_tox_2, (v) =>
                  updateForm({ tet_tox_2: v })
                )}
                {field("Tet Tox 3rd", form.tet_tox_3, (v) =>
                  updateForm({ tet_tox_3: v })
                )}
              </div>

              {/* Tet Tox Notes — full width */}
              <div className="mt-3">
                {field("Tetanus Toxoid Notes", form.tetox_notes, (v) =>
                  updateForm({ tetox_notes: v })
                )}
              </div>

              {/* Urine MCS */}
            <div className="grid grid-cols-2 gap-3">
              {field("Urine MCS Date", form.urine_mcs_date, (v) =>
                updateForm({ urine_mcs_date: v })
              )}
              {field("Urine MCS Result", form.urine_mcs_result, (v) =>
                updateForm({ urine_mcs_result: v })
              )}
            </div>



            {/* Screening for Gestational Diabetes */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Screening for Gestational Diabetes
            </label>

            <div className="flex items-center gap-4">

              {/* First field */}
              <input
                value={form.screening_for_gestational_diabetes_1 || ""}
                onChange={(e) =>
                  updateForm({ screening_for_gestational_diabetes_1: e.target.value })
                }
                disabled={isCompleted}
                className={`w-[100px] px-3 py-1.5 text-sm border border-[#008A80] rounded-lg
                  focus:ring-2 focus:ring-[#008A80] text-gray-900
                  ${isCompleted ? "bg-gray-100 text-gray-500 cursor-not-allowed" : "bg-white"}`}
              />

              {/* Second field */}
              <input
                value={form.screening_for_gestational_diabetes_2 || ""}
                onChange={(e) =>
                  updateForm({ screening_for_gestational_diabetes_2: e.target.value })
                }
                disabled={isCompleted}
                className={`w-[100px] px-3 py-1.5 text-sm border border-[#008A80] rounded-lg
                  focus:ring-2 focus:ring-[#008A80] text-gray-900
                  ${isCompleted ? "bg-gray-100 text-gray-500 cursor-not-allowed" : "bg-white"}`}
              />

              {/* 28w */}
              <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">
                28w
              </span>

              {/* Third field */}
              <input
                value={form.screening_for_gestational_diabetes_3 || ""}
                onChange={(e) =>
                  updateForm({ screening_for_gestational_diabetes_3: e.target.value })
                }
                disabled={isCompleted}
                className={`w-[100px] px-3 py-1.5 text-sm border border-[#008A80] rounded-lg
                  focus:ring-2 focus:ring-[#008A80] text-gray-900
                  ${isCompleted ? "bg-gray-100 text-gray-500 cursor-not-allowed" : "bg-white"}`}
              />

            </div>
          </div>




            {/* HIV Section — Compact + Smaller Font + Dash + Dec + ONLY 2 RETESTS */}
<div className="space-y-3">

  {/* 1️⃣ HIV Status at Booking */}
  <div className="flex items-center gap-2 min-w-0">
    <label className="block text-[11px] font-semibold text-gray-700 whitespace-nowrap">
      HIV Status at Booking
    </label>

    <div className="flex gap-1 flex-wrap min-w-0">
      {["Unknown", "Pos", "Neg", "-"].map((opt) => {
        const isDash = opt === "-";
        const active =
          (isDash && !form.hiv_status_at_booking) ||
          form.hiv_status_at_booking === opt;

        return (
          <button
            key={opt}
            onClick={() =>
              updateForm({
                hiv_status_at_booking: isDash ? "" : opt,
              })
            }
            disabled={isCompleted}
            className={`px-1.5 py-0.5 text-[10px] rounded border font-semibold
              ${
                active && !isDash
                  ? opt === "Pos"
                    ? "bg-green-600 text-white border-green-600"
                    : opt === "Neg"
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-blue-600 text-white border-blue-600" // Unknown
                  : "bg-white text-gray-700 border-gray-300"
              }
              ${isCompleted ? "cursor-not-allowed opacity-60" : ""}
            `}
          >
            {opt}
          </button>
        );
      })}
    </div>
  </div>

  {/* 2️⃣ On ART */}
  <div className="flex items-center gap-2 min-w-0">
    <label className="block text-[11px] font-semibold text-gray-700 whitespace-nowrap">
      On ART
    </label>

    <div className="flex gap-1 flex-wrap min-w-0">
      {["Yes", "No", "-"].map((opt) => {
        const isDash = opt === "-";
        const active =
          (isDash && !form.hiv_booking_on_art) ||
          form.hiv_booking_on_art === opt;

        return (
          <button
            key={opt}
            onClick={() =>
              updateForm({
                hiv_booking_on_art: isDash ? "" : opt,
              })
            }
            disabled={isCompleted}
            className={`px-1.5 py-0.5 text-[10px] rounded border font-semibold
              ${
                active && !isDash
                  ? opt === "Yes"
                    ? "bg-green-600 text-white border-green-600"
                    : "bg-red-600 text-white border-red-600"
                  : "bg-white text-gray-700 border-gray-300"
              }
              ${isCompleted ? "cursor-not-allowed opacity-60" : ""}
            `}
          >
            {opt}
          </button>
        );
      })}
    </div>
  </div>

  {/* 3️⃣ HIV Test at Booking */}
  <div className="grid grid-cols-[110px_1fr_auto] items-center gap-1 min-w-0">
    <label className="text-[11px] font-semibold text-gray-700 whitespace-nowrap">
      HIV Test at Booking
    </label>

    <input
      value={form.hiv_booking_date || ""}
      onChange={(e) => updateForm({ hiv_booking_date: e.target.value })}
      disabled={isCompleted}
      className={`px-2 py-1 text-[12px] border border-[#008A80] rounded-lg w-full min-w-0
        ${isCompleted ? "bg-gray-100 text-gray-500 cursor-not-allowed" : ""}`}
    />

    <div className="flex gap-1 flex-wrap min-w-0">
      {["Pos", "Neg", "Declined", "-"].map((opt) => {
        const isDash = opt === "-";
        const active =
          (isDash && !form.hiv_booking_result) ||
          form.hiv_booking_result === opt;
        const label = opt === "Declined" ? "Dec" : opt;

        return (
          <button
            key={opt}
            onClick={() =>
              updateForm({
                hiv_booking_result: isDash ? "" : opt,
              })
            }
            disabled={isCompleted}
            className={`px-1.5 py-0.5 text-[10px] rounded border font-semibold
              ${
                active && !isDash
                  ? opt === "Pos"
                    ? "bg-green-600 text-white border-green-600"
                    : opt === "Neg"
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-yellow-600 text-white border-yellow-600"
                  : "bg-white text-gray-700 border-gray-300"
              }
              ${isCompleted ? "cursor-not-allowed opacity-60" : ""}
            `}
          >
            {label}
          </button>
        );
      })}
    </div>
  </div>

  {/* 4️⃣ ONLY TWO HIV RETESTS */}
  {[1, 2].map((n) => (
    <div
      key={n}
      className="grid grid-cols-[110px_1fr_auto] items-center gap-1 min-w-0"
    >
      <label className="text-[11px] font-semibold text-gray-700 whitespace-nowrap">
        HIV Retest {n}
      </label>

      <input
        value={form[`hiv_retest_${n}_date`] || ""}
        onChange={(e) =>
          updateForm({ [`hiv_retest_${n}_date`]: e.target.value })
        }
        disabled={isCompleted}
        className={`px-2 py-1 text-[12px] border border-[#008A80] rounded-lg w-full min-w-0
          ${isCompleted ? "bg-gray-100 text-gray-500 cursor-not-allowed" : ""}`}
      />

      <div className="flex gap-1 flex-wrap min-w-0">
        {["Pos", "Neg", "Declined", "-"].map((opt) => {
          const isDash = opt === "-";
          const active =
            (isDash && !form[`hiv_retest_${n}_result`]) ||
            form[`hiv_retest_${n}_result`] === opt;
          const label = opt === "Declined" ? "Dec" : opt;

          return (
            <button
              key={opt}
              onClick={() =>
                updateForm({
                  [`hiv_retest_${n}_result`]: isDash ? "" : opt,
                })
              }
              disabled={isCompleted}
              className={`px-1.5 py-0.5 text-[10px] rounded border font-semibold
                ${
                  active && !isDash
                    ? opt === "Pos"
                      ? "bg-green-600 text-white border-green-600"
                      : opt === "Neg"
                      ? "bg-red-600 text-white border-red-600"
                      : "bg-yellow-600 text-white border-yellow-600"
                    : "bg-white text-gray-700 border-gray-300"
                }
                ${isCompleted ? "cursor-not-allowed opacity-60" : ""}
              `}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  ))}

</div>







            {/* CD4 / ART */}
            <div className="grid grid-cols-2 gap-3">
              {field("CD4", form.cd4, (v) => updateForm({ cd4: v }))}
              {field("ART Initiated On", form.art_initiated_on, (v) =>
                updateForm({ art_initiated_on: v })
              )}
            </div>

            {/* Viral Loads */}
            {[1, 2, 3].map((n) => (
              <div key={n} className="grid grid-cols-2 gap-3">
                {field(`Viral Load ${n} Date`, form[`viral_load_${n}_date`], (v) =>
                  updateForm({ [`viral_load_${n}_date`]: v })
                )}
                {field(`Viral Load ${n} Result`, form[`viral_load_${n}_result`], (v) =>
                  updateForm({ [`viral_load_${n}_result`]: v })
                )}
              </div>
            ))}

            {/* Other */}
            {field("Other", form.other, (v) => updateForm({ other: v }))}
            
          </div>
     </section>


        {/* 7️⃣ Gestational Age (corrected full layout) */}
        <section className="odd:bg-gray-50 even:bg-white p-4 rounded-lg">
          <h4 className="text-xs font-bold text-[#008A80] mb-3 uppercase tracking-wide flex justify-between items-center">
          <span>Gestational Age</span>
          <IssueFlagTrigger
            section="Gestational Age"
            formId={formId}
            onSaved={refreshIssues}
          >
            <button
              className="text-[10px] text-amber-600 hover:text-amber-700 font-normal flex items-center gap-1"
            >
              ⚠️ Flag Issue
            </button>
          </IssueFlagTrigger>

        </h4>
        {/* === Display unresolved issues for this section === */}
{issues
  .filter((i) => i.section_name === "Gestational Age" && !i.resolved)
  .map((i) => (
    <div
      key={i.id}
      className="bg-amber-50 border-l-4 border-amber-500 p-2 mb-2 rounded text-[13px] text-amber-800"
    >
      ⚠️ {i.issue_description}
      {i.created_by && (
        <div className="text-[10px] text-amber-600 mt-1">
          Reported by {i.created_by}
        </div>
      )}
      <button
        onClick={async () => {
          const token = localStorage.getItem("token");
          await fetch(`${API_BASE}/forms/${formId}/issues/${i.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ resolved: true }),
          });
          setIssues((prev) =>
            prev.map((x) =>
              x.id === i.id ? { ...x, resolved: true } : x
            )
          );
        }}
        className="mt-1 text-[10px] text-blue-600 hover:underline"
      >
        Mark resolved
      </button>
    </div>
  ))}


  <div className="text-[#008A80] border border-[#008A80] Border rounded-lg p-3 space-y-3 text-xs">
    {/* Row 1: LNMP + Certain */}
    <div className="grid grid-cols-2 gap-3">
      {field("LNMP", form.lnmp, (v) => updateForm({ lnmp: v }))}
      {yesNoField("Certain?", form.certain, (v) => updateForm({ certain: v }))}
    </div>

    {/* Row 2: Sonar Date */}
    <div className="grid grid-cols-2 gap-3">
      {field("Sonar Date", form.sonar_date, (v) =>
        updateForm({ sonar_date: v })
      )}
    </div>

    {/* Row 3: Biometric measurements */}
    <div className="grid grid-cols-4 gap-3">
      {field("BPD", form.bpd, (v) => updateForm({ bpd: v }))}
      {field("HC", form.hc, (v) => updateForm({ hc: v }))}
      {field("AC", form.ac, (v) => updateForm({ ac: v }))}
      {field("FL", form.fl, (v) => updateForm({ fl: v }))}
    </div>

    {/* Row 4: Additional measurements */}
    <div className="grid grid-cols-4 gap-3">
      {field("CRL", form.crl, (v) => updateForm({ crl: v }))}
      {field("Placenta", form.placenta, (v) =>
        updateForm({ placenta: v })
      )}
      {field("AFI", form.afi, (v) => updateForm({ afi: v }))}
      {field("Average Gestation", form.average_gestation, (v) =>
        updateForm({ average_gestation: v })
      )}
    </div>

    {/* Row 5: Singleton / Multiple / Intrauterine */}
    {/* Pregnancy Type Checkboxes (per MCR form) */}
<div className="flex flex-wrap gap-6 items-center text-xs">

  {/* Singleton */}
  <label className="flex items-center gap-2">
    <input
      type="checkbox"
      checked={!!form.singleton}
      onChange={(e) => updateForm({ singleton: e.target.checked })}
      disabled={isCompleted}
      className="accent-[#008A80] h-3.5 w-3.5"
    />
    <span className="font-semibold text-gray-700">Singleton</span>
  </label>

  {/* Multiple Pregnancy */}
  <label className="flex items-center gap-2">
    <input
      type="checkbox"
      checked={!!form.multiple_pregnancy}
      onChange={(e) => updateForm({ multiple_pregnancy: e.target.checked })}
      disabled={isCompleted}
      className="accent-[#008A80] h-3.5 w-3.5"
    />
    <span className="font-semibold text-gray-700">Multiple Pregnancy</span>
  </label>

  {/* Intrauterine Pregnancy */}
  <label className="flex items-center gap-2">
    <input
      type="checkbox"
      checked={!!form.intrauterine_pregnancy}
      onChange={(e) => updateForm({ intrauterine_pregnancy: e.target.checked })}
      disabled={isCompleted}
      className="accent-[#008A80] h-3.5 w-3.5"
    />
    <span className="font-semibold text-gray-700">Intrauterine Pregnancy</span>
  </label>

</div>


    {/* === Estimated Date of Delivery (one row, label left, input right) === */}
        <div className="flex items-center gap-4 mb-4">
          <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">
            ESTIMATED DATE OF DELIVERY
          </label>

          <input
            disabled={isCompleted}
            value={form.estimated_date_of_delivery || ""}
            onChange={(e) =>
              updateForm({ estimated_date_of_delivery: e.target.value })
            }
            placeholder=""
            className={`px-3 py-1.5 text-sm border border-[#008A80] rounded-lg
              ${isCompleted ? "bg-gray-100 text-gray-500 cursor-not-allowed" : "bg-white"}`}
            style={{ width: "150px" }}  // Adjust width if needed
          />
        </div>


        {/* === Method Used to Calculate EDD (one row) === */}
          <div className="flex items-center gap-6 mb-4">
            <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">
              Method used to calculate EDD
            </label>

            {/* Sonar */}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!form.edd_method_sonar}
                onChange={(e) => updateForm({ edd_method_sonar: e.target.checked })}
                disabled={isCompleted}
                className="accent-[#008A80] h-4 w-4"
              />
              <span className="text-xs font-semibold text-gray-700">Sonar</span>
            </label>

            {/* SF */}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!form.edd_method_sf}
                onChange={(e) => updateForm({ edd_method_sf: e.target.checked })}
                disabled={isCompleted}
                className="accent-[#008A80] h-4 w-4"
              />
              <span className="text-xs font-semibold text-gray-700">SF</span>
            </label>

            {/* LNMP */}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!form.edd_method_lnmp}
                onChange={(e) => updateForm({ edd_method_lnmp: e.target.checked })}
                disabled={isCompleted}
                className="accent-[#008A80] h-4 w-4"
              />
              <span className="text-xs font-semibold text-gray-700">LNMP</span>
            </label>
          </div>


  </div>
</section>


        {/* 9️⃣ Mental Health (corrected layout) */}
        <section className="odd:bg-gray-50 even:bg-white p-4 rounded-lg">
          <h4 className="text-xs font-bold text-[#008A80] mb-3 uppercase tracking-wide flex justify-between items-center">
          <span>Mental Health</span>
            <IssueFlagTrigger
            section="Mental Health"
            formId={formId}
            onSaved={refreshIssues}
          >
            <button
              className="text-[10px] text-amber-600 hover:text-amber-700 font-normal flex items-center gap-1"
            >
              ⚠️ Flag Issue
            </button>
          </IssueFlagTrigger>

        </h4>
        {/* === Display unresolved issues for this section === */}
{issues
  .filter((i) => i.section_name === "Mental Health" && !i.resolved)
  .map((i) => (
    <div
      key={i.id}
      className="bg-amber-50 border-l-4 border-amber-500 p-2 mb-2 rounded text-[13px] text-amber-800"
    >
      ⚠️ {i.issue_description}
      {i.created_by && (
        <div className="text-[10px] text-amber-600 mt-1">
          Reported by {i.created_by}
        </div>
      )}
      <button
        onClick={async () => {
          const token = localStorage.getItem("token");
          await fetch(`${API_BASE}/forms/${formId}/issues/${i.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ resolved: true }),
          });
          setIssues((prev) =>
            prev.map((x) =>
              x.id === i.id ? { ...x, resolved: true } : x
            )
          );
        }}
        className="mt-1 text-[10px] text-blue-600 hover:underline"
      >
        Mark resolved
      </button>
    </div>
  ))}


  <div className="text-[#008A80] border border-[#008A80]Border rounded-lg p-3 space-y-3 text-xs">
    {/* LINE 1: Screening + Score */}
      <div className="flex items-center gap-2 whitespace-nowrap">
        {yesNoField(
          <span className="mr-4">Mental Health Screening</span>,
          form.screening_performed,
          (v) => updateForm({ screening_performed: v })
        )}


        <div className="flex items-center gap-2">
  <span className="text-xs font-semibold text-gray-700">Score</span>
  <input
    disabled={isCompleted}
    value={form.mental_health_score || ""}
    onChange={(e) => updateForm({ mental_health_score: e.target.value })}
    className="px-2 py-1 text-sm border border-[#008A80] rounded-lg w-20"
  />
</div>

      </div>

      {/* LINE 2: Discussed and noted (full width, separate row) */}
      <div className="mt-2 flex items-center gap-4">
        <label className="text-xs font-semibold text-gray-700">
          Discussed and Noted in Case Record
        </label>

          <div className="flex gap-1">
            {yesNo.map((opt) => (
              <button
                key={opt || "unset"}
                onClick={() => updateForm({ discussed_in_record: opt })}
                className={`px-2 py-0.5 text-xs font-semibold rounded ${
                  form.discussed_in_record === opt
                    ? opt === "Yes"
                      ? "bg-green-600 text-white"
                      : opt === "No"
                      ? "bg-red-600 text-white"
                      : "bg-gray-500 text-white"
                    : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
                }`}
              >
                {opt || "-"}
              </button>
            ))}
          </div>
        </div>


      {/* LINE 3: Referred */}
      <div className="mt-2">
        {field(
          "Where Referred for Mental Health",
          form.referred_to,
          (v) => updateForm({ referred_to: v })
        )}
      </div>

  </div>
</section>



        {/* 🔟 Birth Companion */}
          <section className="odd:bg-gray-50 even:bg-white p-4 rounded-lg">
            <h4 className="text-xs font-bold text-[#008A80] mb-3 uppercase tracking-wide flex justify-between items-center">
            <span>Birth Companion</span>
              <IssueFlagTrigger
              section="Birth Companion"
              formId={formId}
              onSaved={refreshIssues}
            >
              <button
                className="text-[10px] text-amber-600 hover:text-amber-700 font-normal flex items-center gap-1"
              >
                ⚠️ Flag Issue
              </button>
            </IssueFlagTrigger>

          </h4>

          {/* === Display unresolved issues for this section === */}
{issues
  .filter((i) => i.section_name === "Birth Companion" && !i.resolved)
  .map((i) => (
    <div
      key={i.id}
      className="bg-amber-50 border-l-4 border-amber-500 p-2 mb-2 rounded text-[13px] text-amber-800"
    >
      ⚠️ {i.issue_description}
      {i.created_by && (
        <div className="text-[10px] text-amber-600 mt-1">
          Reported by {i.created_by}
        </div>
      )}
      <button
        onClick={async () => {
          const token = localStorage.getItem("token");
          await fetch(`${API_BASE}/forms/${formId}/issues/${i.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ resolved: true }),
          });
          setIssues((prev) =>
            prev.map((x) =>
              x.id === i.id ? { ...x, resolved: true } : x
            )
          );
        }}
        className="mt-1 text-[10px] text-blue-600 hover:underline"
      >
        Mark resolved
      </button>
    </div>
  ))}


            <div className="text-[#008A80] border border-[#008A80]Border rounded-lg p-3">
              {yesNoField(
                "Discussed and Noted on MCR",
                form.discussed,
                (v) => updateForm({ discussed: v })
              )}
            </div>
          </section>


        {/* 11️⃣ Counselling */}
          <section className="odd:bg-gray-50 even:bg-white p-4 rounded-lg">
            <h4 className="text-xs font-bold text-[#008A80] mb-3 uppercase tracking-wide flex justify-between items-center">
            <span>Counselling</span>
            <IssueFlagTrigger
              section="Counselling"
              formId={formId}
              onSaved={refreshIssues}
            >
              <button
                className="text-[10px] text-amber-600 hover:text-amber-700 font-normal flex items-center gap-1"
              >
                ⚠️ Flag Issue
              </button>
            </IssueFlagTrigger>

          </h4>

            <div className="text-[#008A80] border border-[#008A80] Border rounded-lg p-2 overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b-2 border-[#008A80] Border">
                    {["#", "Topic", "Date 1", "Date 2"].map((h) => (
                      <th
                        key={h}
                        className="text-left p-1.5 font-bold text-[#008A80] "
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {counselling.map((row, i) => (
                    <tr key={i} className="border-b border-[#008A80] Border">
                      
                      {/* Record number */}
                      <td className="p-1.5 text-[#008A80] font-bold">
                        {row.record_number ?? i + 1}
                      </td>

                      {/* Topic (fixed label – never editable) */}
                      <td className="p-1.5 text-[#008A80] font-semibold whitespace-nowrap">
                        {row.topic}
                      </td>

                      {/* Date 1 */}
                      <td className="p-1.5">
                        <input
                          className="w-full border border-[#008A80] Border rounded px-1.5 py-1"
                          value={row.date_1 || ""}
                          onChange={(e) =>
                            setCounselling((prev) =>
                              prev.map((r, idx) =>
                                idx === i ? { ...r, date_1: e.target.value } : r
                              )
                            )
                          }
                        />
                      </td>

                      {/* Date 2 */}
                      <td className="p-1.5">
                        <input
                          className="w-full border border-[#008A80] Border rounded px-1.5 py-1"
                          value={row.date_2 || ""}
                          onChange={(e) =>
                            setCounselling((prev) =>
                              prev.map((r, idx) =>
                                idx === i ? { ...r, date_2: e.target.value } : r
                              )
                            )
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>

              </table>
            </div>
          </section>


        {/* 12️⃣ Future Contraception (checkbox version – matches MCR) */}
        <section className="odd:bg-gray-50 even:bg-white p-4 rounded-lg">
         <h4 className="text-xs font-bold text-[#008A80]  mb-1 uppercase tracking-wide flex justify-between items-center">
          <span>
            Future Contraception
            <span className="ml-1 font-normal text-[11px] text-[#008A80]">
              (Provide dual protection)
            </span>
          </span>
            <IssueFlagTrigger
            section="Future Contraception"
            formId={formId}
            onSaved={refreshIssues}
          >
            <button
              className="text-[10px] text-amber-600 hover:text-amber-700 font-normal flex items-center gap-1"
            >
              ⚠️ Flag Issue
            </button>
          </IssueFlagTrigger>

        </h4>

      {/* === Display unresolved issues for this section === */}
{issues
  .filter((i) => i.section_name === "Future Contraception" && !i.resolved)
  .map((i) => (
    <div
      key={i.id}
      className="bg-amber-50 border-l-4 border-amber-500 p-2 mb-2 rounded text-[13px] text-amber-800"
    >
      ⚠️ {i.issue_description}
      {i.created_by && (
        <div className="text-[10px] text-amber-600 mt-1">
          Reported by {i.created_by}
        </div>
      )}
      <button
        onClick={async () => {
          const token = localStorage.getItem("token");
          await fetch(`${API_BASE}/forms/${formId}/issues/${i.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ resolved: true }),
          });
          setIssues((prev) =>
            prev.map((x) =>
              x.id === i.id ? { ...x, resolved: true } : x
            )
          );
        }}
        className="mt-1 text-[10px] text-blue-600 hover:underline"
      >
        Mark resolved
      </button>
    </div>
  ))}


          <div className="text-[#008A80] border border-[#008A80] Border rounded-lg p-3 space-y-3 text-xs">
            {/* Row 1: Contraceptive methods as checkboxes */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {[
                ["Implant", "implant"],
                ["Inject", "inject"],
                ["Intra-uterine Device", "iud"],
                ["Tubal Ligation", "tubal_ligation"],
                ["Oral", "oral"],
              ].map(([label, key]) => (
                <label key={key} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={!!form[key]}
                    onChange={(e) =>
                      updateForm({ [key]: e.target.checked ? true : false })
                    }
                    className="accent-[#008A80] h-3.5 w-3.5"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            {/* Row 2: Management & educational info */}
            <div className="grid grid-cols-2 gap-3">
              {yesNoField(
                "All Management Plans Discussed with Patient",
                form.counselling_done,
                (v) => updateForm({ counselling_done: v })
              )}
              {yesNoField(
                "Educational Material Given on Pregnancy and Patient Rights",
                form.educational_material_given,
                (v) => updateForm({ educational_material_given: v })
              )}
            </div>

            {/* Row 3: Tubal counselling */}
            <div>
              {yesNoField(
                "If Tubal Ligation Selected, Adequate Counselling Given",
                form.tubal_counselling,
                (v) => updateForm({ tubal_counselling: v })
              )}
            </div>
          </div>
        </section>




        {/* 13️⃣ Booking Visit and Assessment */}
          <section className="odd:bg-gray-50 even:bg-white p-4 rounded-lg">
            <h4 className="text-xs font-bold text-[#008A80] mb-3 uppercase tracking-wide">
              Booking Visit and Assessment
            </h4>

            <div className="border border-[#008A80] rounded-lg p-3 text-[#008A80]">

              {/* Done By + Date */}
              <div className="grid grid-cols-2 gap-3">
                {field("Done By", form.booking_done_by, (v) =>
                  updateForm({ booking_done_by: v })
                )}

                {field("Date", form.booking_date, (v) =>
                  updateForm({ booking_date: v })
                )}
              </div>

            </div>
          </section>





        {/* NOTES */}
        <section className="odd:bg-gray-50 even:bg-white p-4 rounded-lg">
          <h4 className="text-xs font-bold text-[#008A80] mb-3 uppercase tracking-wide">
            Notes
          </h4>

          <textarea
            className="w-full border border-[#008A80] rounded-lg p-3 text-sm"
            rows={4}
            value={form.notes || ""}
            onChange={(e) => updateForm({ notes: e.target.value })}
            placeholder="Enter any notes here..."
          />
        </section>
    </div>

    {/* Buttons below the main form */}
        <div className="flex justify-center gap-4 mt-6 mb-6">
          <button
            onClick={markAsCompleted}
            disabled={isCompleted}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 transition disabled:opacity-50"
          >
            <span>✅</span> Mark as Completed
          </button>

          <IssueFlagTrigger
            section="General Form"
            formId={formId}
            onSaved={refreshIssues}
          >
            <button
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded hover:bg-amber-600 transition"
            >
              ⚠️ Flag Issue
            </button>
          </IssueFlagTrigger>
        </div>



{/* Save button */}
<div className="border-t border-gray-200 p-3 bg-white">
  <button
    onClick={handleSave}
    disabled={saving || isCompleted}
    className="w-full flex items-center justify-center bg-[#008A80] text-white py-2 rounded-lg font-semibold hover:bg-[#008A80] transition-all disabled:opacity-50"
  >
    {saving ? (
      <>
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Saving...
      </>
    ) : saveSuccess ? (
      <>
        <CheckCircle className="w-4 h-4 mr-2" />
        Saved
      </>
    ) : (
      <>
        <Save className="w-4 h-4 mr-2" />
        Save Changes
      </>
        )}
  </button>
</div> 


</div> 

); 
}; 

export default DataPanel;
