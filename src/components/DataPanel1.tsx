import { useEffect, useMemo, useState } from "react";
import { Save, Trash2, Loader2, CheckCircle, Edit3, Plus, X } from "lucide-react";

interface DataPanelProps {
  formId: string | null;
  onFormDeleted: () => void;
  onFormUpdated: () => void;
}

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001/api";

// ---- Types for structured payload ----
type FormCore = {
  id: string;
  file_name?: string;
  file_url?: string;
  upload_date?: string;

  // Header Identification
  healthcare_worker_name?: string;
  clinic?: string;
  folder_number?: string;
  form_date?: string;
  patient_name?: string;
  age?: string;
  gravida?: string;
  para?: string;
  miscarriages?: string;

  // Medical & General History (subset shown; extend as needed)
  hypertension?: string;
  diabetes?: string;
  cardiac?: string;
  asthma?: string;
  tuberculosis?: string;
  epilepsy?: string;
  mental_health_disorder?: string;
  hiv?: string;
  other_condition?: string;

  family_history_diabetes?: string;
  family_history_tb?: string;
  family_history_genetic?: string;
  family_history_other?: string;

  medication?: string;
  operations?: string;
  allergies?: string;
  tb_symptom_screen?: string;
  alcohol_use?: string;
  tobacco_use?: string;
  substance_use?: string;
  psychosocial_risk_factors?: string;

  // Footer
  healthcare_worker_signature?: string;
  date_of_assessment?: string;
  notes?: string;
};

type ObstetricRow = {
  id?: string;
  record_number?: number | null;
  year?: string;
  gestation?: string;
  delivery?: string;
  weight?: string;
  sex?: string;
  outcome?: string;
  complications?: string;
  description_of_complications?: string;
};

type InvestigationRow = {
  id?: string;
  record_number?: number | null;
  investigation_date?: string;
  result?: string;
  hospital_syphilis_test?: string;
  preg?: string;
  hb?: string;
  rh?: string;
  other_investigations?: string;
};

type CounsellingRow = {
  id?: string;
  record_number?: number | null;
  topic?: string;
  date_1?: string;
  date_2?: string;
};

type CombinedRecord = {
  form: FormCore;
  obstetric: ObstetricRow[];
  investigations: InvestigationRow[];
  counselling: CounsellingRow[];
};

const yesNo = ["Yes", "No", ""]; // helper for toggles

const DataPanel: React.FC<DataPanelProps> = ({ formId, onFormDeleted, onFormUpdated }) => {
  const [data, setData] = useState<CombinedRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ---- Load structured record ----
  useEffect(() => {
  if (!formId) {
    setData(null);
    return;
  }

  (async () => {
    setLoading(true);
    try {
      // ✅ get token from localStorage
      const token = localStorage.getItem("token");

      // ✅ include Authorization header
      const res = await fetch(`${API_BASE}/forms/${formId}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, // 👈 this is the missing line
        },
      });

      const payload = await res.json();
      setData({
        form: payload.form || {},
        obstetric: payload.obstetric || [],
        investigations: payload.investigations || [],
        counselling: payload.counselling || [],
      });
    } catch (e) {
      console.error("load form error", e);
    } finally {
      setLoading(false);
    }
  })();
}, [formId]);


  // ---- Field handlers ----
  const updateForm = (patch: Partial<FormCore>) =>
    setData((prev) => (prev ? { ...prev, form: { ...prev.form, ...patch } } : prev));

  const updateObstetric = (index: number, patch: Partial<ObstetricRow>) =>
    setData((prev) =>
      prev
        ? {
            ...prev,
            obstetric: prev.obstetric.map((r, i) => (i === index ? { ...r, ...patch } : r)),
          }
        : prev
    );

  const addObstetric = () =>
    setData((prev) =>
      prev
        ? {
            ...prev,
            obstetric: [
              ...prev.obstetric,
              { record_number: (prev.obstetric?.length || 0) + 1 } as ObstetricRow,
            ],
          }
        : prev
    );

  const removeObstetric = (index: number) =>
    setData((prev) =>
      prev
        ? { ...prev, obstetric: prev.obstetric.filter((_, i) => i !== index) }
        : prev
    );

  const updateInvestigation = (index: number, patch: Partial<InvestigationRow>) =>
    setData((prev) =>
      prev
        ? {
            ...prev,
            investigations: prev.investigations.map((r, i) => (i === index ? { ...r, ...patch } : r)),
          }
        : prev
    );

  const addInvestigation = () =>
    setData((prev) =>
      prev
        ? {
            ...prev,
            investigations: [
              ...prev.investigations,
              { record_number: (prev.investigations?.length || 0) + 1 } as InvestigationRow,
            ],
          }
        : prev
    );

  const removeInvestigation = (index: number) =>
    setData((prev) =>
      prev
        ? { ...prev, investigations: prev.investigations.filter((_, i) => i !== index) }
        : prev
    );

  const updateCounselling = (index: number, patch: Partial<CounsellingRow>) =>
    setData((prev) =>
      prev
        ? {
            ...prev,
            counselling: prev.counselling.map((r, i) => (i === index ? { ...r, ...patch } : r)),
          }
        : prev
    );

  const addCounselling = () =>
    setData((prev) =>
      prev
        ? {
            ...prev,
            counselling: [
              ...prev.counselling,
              { record_number: (prev.counselling?.length || 0) + 1 } as CounsellingRow,
            ],
          }
        : prev
    );

  const removeCounselling = (index: number) =>
    setData((prev) =>
      prev
        ? { ...prev, counselling: prev.counselling.filter((_, i) => i !== index) }
        : prev
    );

  // ---- Save & Delete ----
  const handleSave = async () => {
  if (!formId || !data) return;
  setSaving(true);
  setSaveSuccess(false);

  try {
    // ✅ get token from localStorage
    const token = localStorage.getItem("token");

    const res = await fetch(`${API_BASE}/forms/${formId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`, // 👈 add this line
      },
      body: JSON.stringify({
        form: data.form,
        obstetric: data.obstetric,
        investigations: data.investigations,
        counselling: data.counselling,
      }),
    });

    if (!res.ok) throw new Error("Failed to save");
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 1500);
    onFormUpdated();
  } catch (e) {
    console.error(e);
    alert("Failed to save changes");
  } finally {
    setSaving(false);
  }
};

  const handleDelete = async () => {
  if (!formId) return;
  if (!confirm("Are you sure you want to delete this form? This cannot be undone.")) return;
  setDeleting(true);
  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE}/forms/${formId}`, {
    method: "DELETE",
    headers: {
        Authorization: `Bearer ${token}`, // ✅ add JWT
    },
    });

    if (!res.ok) throw new Error("Failed to delete");

    alert("Form deleted successfully");

    // ✅ Safely trigger parent refresh if provided
    if (typeof onFormDeleted === "function") {
      onFormDeleted();
    }
  } catch (e) {
    console.error("Failed to delete form:", e);
    alert("Failed to delete form");
  } finally {
    setDeleting(false);
  }
};


  // ---- UI helpers ----
  const field = (label: string, value: string | undefined, onChange: (v: string) => void, placeholder?: string) => (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
        placeholder={placeholder || label}
      />
    </div>
  );

  const yesNoField = (
  label: string,
  value: string | undefined,
  onChange: (v: string) => void,
  opts?: { compact?: boolean }
) => {
  const compact = !!opts?.compact;
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold text-gray-700 mb-1 truncate">{label}</div>
      <div className={`flex ${compact ? "flex-wrap" : "flex-nowrap"} gap-1`}>
        {yesNo.map((opt) => (
          <button
            key={opt || "unset"}
            onClick={() => onChange(opt)}
            className={[
              "rounded-md text-xs font-semibold transition-all",
              compact ? "px-2 py-0.5" : "px-3 py-1",
              value === opt
                ? opt === "Yes"
                  ? "bg-green-600 text-white"
                  : opt === "No"
                  ? "bg-red-600 text-white"
                  : "bg-gray-600 text-white"
                : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50",
            ].join(" ")}
          >
            {opt || "Unset"}
          </button>
        ))}
      </div>
    </div>
  );
};


  if (!formId) {
    return (
      <div className="w-96 bg-white border-l border-gray-200 flex items-center justify-center p-6">
        <div className="text-center">
          <Edit3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 font-medium">No document selected</p>
          <p className="text-xs text-gray-400 mt-1">Select a file to view extracted data</p>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="w-96 bg-white border-l border-gray-200 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
      </div>
    );
  }

  const { form, obstetric, investigations, counselling } = data;

  return (
  <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
    {/* Header */}
    <div className="px-4 py-3 border-b border-gray-200 bg-white">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">Extracted Data</h3>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50"
          title="Delete form"
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-xs text-gray-500">
        {form.file_name || "Form"} • {(obstetric?.length || 0) + (investigations?.length || 0) + (counselling?.length || 0)} table rows
      </p>
    </div>

    {/* Scrollable content */}
    <div className="flex-1 overflow-y-auto p-4 space-y-6">

      {/* 1️⃣ Header Identification */}
      <section>
        <h4 className="text-xs font-bold text-gray-900 mb-3 uppercase tracking-wide">Header Identification</h4>
        <div className="grid grid-cols-2 gap-3">
          {field("Healthcare Worker Name", form.healthcare_worker_name, (v) => updateForm({ healthcare_worker_name: v }))}
          {field("Clinic", form.clinic, (v) => updateForm({ clinic: v }))}
          {field("Folder Number", form.folder_number, (v) => updateForm({ folder_number: v }))}
          {field("Form Date", form.form_date, (v) => updateForm({ form_date: v }))}
          {field("Patient Name", form.patient_name, (v) => updateForm({ patient_name: v }))}
          {field("Age", form.age, (v) => updateForm({ age: v }))}
          {field("Gravida", form.gravida, (v) => updateForm({ gravida: v }))}
          {field("Para", form.para, (v) => updateForm({ para: v }))}
          {field("Miscarriages", form.miscarriages, (v) => updateForm({ miscarriages: v }))}
        </div>
      </section>

      {/* 2️⃣ Obstetric & Neonatal History */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Obstetric & Neonatal History</h4>
          <button onClick={addObstetric} className="px-2 py-1 text-xs bg-purple-600 text-white rounded-md flex items-center gap-1">
            <Plus className="w-3 h-3" /> Add Row
          </button>
        </div>
        <div className="bg-purple-50 rounded-lg border border-purple-200 p-2 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-purple-300">
                {["#", "Year", "Gestation", "Delivery", "Weight", "Sex", "Outcome", "Complications", ""].map((h) => (
                  <th key={h} className="text-left p-1.5 font-bold text-purple-900">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {obstetric.map((row, i) => (
                <tr key={i} className="border-b border-purple-200">
                  <td className="p-1.5 text-purple-700 font-bold">{row.record_number ?? i + 1}</td>
                  {["year","gestation","delivery","weight","sex","outcome","complications"].map((f)=>(
                    <td key={f} className="p-1.5">
                      <input className="w-full border border-purple-300 rounded px-1.5 py-1"
                        value={(row as any)[f] || ""}
                        onChange={(e)=>updateObstetric(i,{[f]:e.target.value})}/>
                    </td>
                  ))}
                  <td className="p-1.5 text-right">
                    <button className="p-1 rounded hover:bg-red-50 text-red-600" onClick={() => removeObstetric(i)} title="Remove row">
                      <X className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3️⃣ Medical & General History */}
      <section>
        <h4 className="text-xs font-bold text-gray-900 mb-3 uppercase tracking-wide">Medical & General History</h4>
        <div className="space-y-2 bg-purple-50 rounded-lg border border-purple-200 p-3 mb-3">
          {["Hypertension","Diabetes","Cardiac","Asthma","Tuberculosis","Epilepsy","HIV","Mental Health Disorder"].map((label)=>
            yesNoField(label, (form as any)[label.toLowerCase().replace(/ /g,"_")], 
              (v)=>updateForm({[label.toLowerCase().replace(/ /g,"_")]:v}))
          )}
        </div>
        <div className="space-y-3">
          {["Medication","Operations","Allergies","TB Symptom Screen","Alcohol Use","Tobacco Use","Substance Use","Psychosocial Risk Factors"].map((label)=>
            field(label,(form as any)[label.toLowerCase().replace(/ /g,"_")],
              (v)=>updateForm({[label.toLowerCase().replace(/ /g,"_")]:v}))
          )}
        </div>
      </section>

      {/* Family History */}
<section>
  <h4 className="text-xs font-bold text-gray-900 mb-3 uppercase tracking-wide">
    Family History
  </h4>
  <div className="bg-purple-50 rounded-lg border border-purple-200 p-3 space-y-3">
    {/* 4 toggles aligned cleanly */}
    <div className="grid grid-cols-4 sm:grid-cols-4 gap-2">
      <div className="flex flex-col items-start space-y-1">
        <span className="text-xs font-semibold text-gray-700">Twins</span>
        {yesNoField("Twins", form.family_history_twins, (v) =>
          updateForm({ family_history_twins: v })
        )}
      </div>

      <div className="flex flex-col items-start space-y-1">
        <span className="text-xs font-semibold text-gray-700">Diabetes</span>
        {yesNoField("Diabetes", form.family_history_diabetes, (v) =>
          updateForm({ family_history_diabetes: v })
        )}
      </div>

      <div className="flex flex-col items-start space-y-1">
        <span className="text-xs font-semibold text-gray-700">TB</span>
        {yesNoField("TB", form.family_history_tb, (v) =>
          updateForm({ family_history_tb: v })
        )}
      </div>

      <div className="flex flex-col items-start space-y-1 col-span-1 sm:col-span-1 min-w-[110px]">
        <span className="text-xs font-semibold text-gray-700">Congenital</span>
        {yesNoField("Congenital", form.family_history_congenital, (v) =>
          updateForm({ family_history_congenital: v })
        )}
      </div>
    </div>

    {/* Details field */}
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1 mt-2">
        Details
      </label>
      <textarea
        rows={2}
        value={form.family_history_details || ""}
        onChange={(e) =>
          updateForm({ family_history_details: e.target.value })
        }
        className="w-full px-3 py-2 text-sm border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-y"
        placeholder="Describe relevant family history..."
      />
    </div>
  </div>
</section>


      {/* 4️⃣ Vaginal Examination */}
      <section>
        <h4 className="text-xs font-bold text-gray-900 mb-3 uppercase tracking-wide">Vaginal Examination</h4>
        <div className="grid grid-cols-2 gap-3 bg-purple-50 rounded-lg border border-purple-200 p-3">
          {field("Examination Explained & Permission", form.exam_permission, (v) => updateForm({ exam_permission: v }))}
          {field("Vulva and Vagina", form.vulva_vagina, (v) => updateForm({ vulva_vagina: v }))}
          {field("Cervix", form.cervix, (v) => updateForm({ cervix: v }))}
          {field("Uterus", form.uterus, (v) => updateForm({ uterus: v }))}
          {yesNoField("Pap Smear Done", form.pap_done, (v) => updateForm({ pap_done: v }))}
          {field("Pap Smear Date", form.pap_date, (v) => updateForm({ pap_date: v }))}
          {field("Pap Smear Result", form.pap_result, (v) => updateForm({ pap_result: v }))}
        </div>
      </section>

      {/* 5️⃣ Investigations */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Investigations</h4>
          <button onClick={addInvestigation} className="px-2 py-1 text-xs bg-purple-600 text-white rounded-md flex items-center gap-1">
            <Plus className="w-3 h-3" /> Add Row
          </button>
        </div>
        <div className="bg-purple-50 rounded-lg border border-purple-200 p-2 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-purple-300">
                {["#","Date","Result","Syphilis Test","Hb","Rh","Other",""].map((h)=>(
                  <th key={h} className="text-left p-1.5 font-bold text-purple-900">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {investigations.map((row,i)=>(
                <tr key={i} className="border-b border-purple-200">
                  <td className="p-1.5 text-purple-700 font-bold">{row.record_number ?? i+1}</td>
                  {["investigation_date","result","hospital_syphilis_test","hb","rh","other_investigations"].map((f)=>
                    <td key={f} className="p-1.5">
                      <input className="w-full border border-purple-300 rounded px-1.5 py-1"
                        value={(row as any)[f]||""}
                        onChange={(e)=>updateInvestigation(i,{[f]:e.target.value})}/>
                    </td>
                  )}
                  <td className="p-1.5 text-right">
                    <button className="p-1 rounded hover:bg-red-50 text-red-600" onClick={()=>removeInvestigation(i)} title="Remove row">
                      <X className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 6️⃣ Gestational Age */}
      <section>
        <h4 className="text-xs font-bold text-gray-900 mb-3 uppercase tracking-wide">Gestational Age</h4>
        <div className="grid grid-cols-2 gap-3 bg-purple-50 rounded-lg border border-purple-200 p-3">
          {field("LNMP", form.lnmp, (v) => updateForm({ lnmp: v }))}
          {yesNoField("Certain", form.lnmp_certain, (v) => updateForm({ lnmp_certain: v }))}
          {field("Sonar", form.sonar, (v) => updateForm({ sonar: v }))}
          {field("BPD", form.bpd, (v) => updateForm({ bpd: v }))}
          {field("HC", form.hc, (v) => updateForm({ hc: v }))}
          {field("AC", form.ac, (v) => updateForm({ ac: v }))}
          {field("FL", form.fl, (v) => updateForm({ fl: v }))}
          {field("CRL", form.crl, (v) => updateForm({ crl: v }))}
          {field("Placenta", form.placenta, (v) => updateForm({ placenta: v }))}
          {field("AFI", form.afi, (v) => updateForm({ afi: v }))}
          {field("Average Gestation", form.avg_gestation, (v) => updateForm({ avg_gestation: v }))}
          {field("Singleton", form.singleton, (v) => updateForm({ singleton: v }))}
          {field("Multiple Pregnancy", form.multiple_pregnancy, (v) => updateForm({ multiple_pregnancy: v }))}
          {field("Intra-Uterine Pregnancy", form.iup, (v) => updateForm({ iup: v }))}
        </div>
      </section>

      {/* 7️⃣ Estimated Date of Delivery */}
      <section>
        <h4 className="text-xs font-bold text-gray-900 mb-3 uppercase tracking-wide">Estimated Date of Delivery</h4>
        <div className="grid grid-cols-1 gap-3 bg-purple-50 rounded-lg border border-purple-200 p-3">
          {field("Method Used to Calculate EDD", form.edd_method, (v) => updateForm({ edd_method: v }))}
        </div>
      </section>

      {/* 8️⃣ Mental Health */}
      <section>
        <h4 className="text-xs font-bold text-gray-900 mb-3 uppercase tracking-wide">Mental Health</h4>
        <div className="bg-purple-50 rounded-lg border border-purple-200 p-3 space-y-2">
          {field("Screening Score", form.mental_health_score, (v) => updateForm({ mental_health_score: v }))}
          {field("Discussed and Noted in Case Record", form.mental_health_discussed, (v) => updateForm({ mental_health_discussed: v }))}
          {field("Referred Facility", form.mental_health_referral, (v) => updateForm({ mental_health_referral: v }))}
        </div>
      </section>

      {/* 9️⃣ Birth Companion */}
      <section>
        <h4 className="text-xs font-bold text-gray-900 mb-3 uppercase tracking-wide">Birth Companion</h4>
        <div className="bg-purple-50 rounded-lg border border-purple-200 p-3">
          {yesNoField("Discussed and Noted on MCR", form.birth_companion_discussed, (v) => updateForm({ birth_companion_discussed: v }))}
        </div>
      </section>

      {/* 🔟 Future Contraception */}
      <section>
        <h4 className="text-xs font-bold text-gray-900 mb-3 uppercase tracking-wide">Future Contraception</h4>
        <div className="grid grid-cols-2 gap-3 bg-purple-50 rounded-lg border border-purple-200 p-3">
          {yesNoField("Dual Protection", form.dual_protection, (v) => updateForm({ dual_protection: v }))}
          {yesNoField("Implant", form.implant, (v) => updateForm({ implant: v }))}
          {yesNoField("Inject", form.inject, (v) => updateForm({ inject: v }))}
          {yesNoField("Intra-Uterine Device", form.iud, (v) => updateForm({ iud: v }))}
          {yesNoField("Tubal Ligation", form.tubal_ligation, (v) => updateForm({ tubal_ligation: v }))}
          {yesNoField("Oral", form.oral, (v) => updateForm({ oral: v }))}
          {field("If Tubal Ligation Selected, Adequate Counselling Given", form.tubal_counselling, (v) => updateForm({ tubal_counselling: v }))}
        </div>
      </section>

      {/* 11️⃣ Booking Visit & Assessment */}
      <section>
        <h4 className="text-xs font-bold text-gray-900 mb-3 uppercase tracking-wide">Booking Visit & Assessment</h4>
        <div className="grid grid-cols-2 gap-3 bg-purple-50 rounded-lg border border-purple-200 p-3">
          {field("Done By", form.booking_done_by, (v) => updateForm({ booking_done_by: v }))}
          {field("Date", form.booking_date, (v) => updateForm({ booking_date: v }))}
          {field("Educational Material Given", form.education_given, (v) => updateForm({ education_given: v }))}
          {field("All Management Plans Discussed with Patient", form.management_plan, (v) => updateForm({ management_plan: v }))}
        </div>
      </section>

      {/* Footer */}
      <section>
        <h4 className="text-xs font-bold text-gray-900 mb-3 uppercase tracking-wide">Footer</h4>
        <div className="grid grid-cols-2 gap-3">
          {field("Healthcare Worker Signature", form.healthcare_worker_signature, (v) => updateForm({ healthcare_worker_signature: v }))}
          {field("Date of Assessment", form.date_of_assessment, (v) => updateForm({ date_of_assessment: v }))}
        </div>
        <div className="mt-3">
          <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
          <textarea
            value={form.notes || ""}
            onChange={(e) => updateForm({ notes: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            rows={3}
          />
        </div>
      </section>
    </div>

    {/* Action bar */}
    <div className="px-4 py-3 border-t border-gray-200 bg-white">
      <button
        onClick={handleSave}
        disabled={saving || saveSuccess}
        className="w-full bg-purple-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-purple-700 transition-all disabled:opacity-50 flex items-center justify-center text-sm"
      >
        {saveSuccess ? (
          <>
            <CheckCircle className="w-4 h-4 mr-2" />
            Saved
          </>
        ) : saving ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Saving...
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
