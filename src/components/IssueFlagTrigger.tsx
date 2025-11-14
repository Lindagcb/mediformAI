import React, { useState } from "react";

const presetOptions = [
  "Illegible",
  "Incorrect",
  "Missing",
];

interface IssueFlagTriggerProps {
  section: string;
  formId: string;
  API_BASE?: string;
  onSaved?: () => void;
  children: React.ReactNode;
}

const IssueFlagTrigger: React.FC<IssueFlagTriggerProps> = ({
  section,
  formId,
  API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001/api",
  onSaved = () => {},
  children,
}) => {
  const [open, setOpen] = useState(false);
  const [issue, setIssue] = useState("");

  const submit = async () => {
    if (!issue.trim()) return;

    const token = localStorage.getItem("token");

    await fetch(`${API_BASE}/forms/${formId}/issues`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        section_name: section,
        issue_description: issue,
      }),
    });

    setIssue("");
    setOpen(false);
    onSaved();
  };

return (
  <div className="inline-flex">
    {/* Toggle wrapper — must be inline-flex to avoid breaking header layout */}
    <div
      onClick={() => setOpen(!open)}
      className="inline-flex cursor-pointer"
    >
      {children}
    </div>

    {/* Inline card */}
    {open && (
      <div className="border border-amber-300 bg-amber-50 p-3 rounded-lg mt-2 text-xs shadow-sm">

        {/* Three preset buttons */}
        <div className="flex flex-wrap gap-2 mb-2">
          {presetOptions.map((opt) => (
            <button
              key={opt}
              onClick={() => setIssue(opt)}
              className="px-2 py-1 rounded bg-white border text-[11px] hover:bg-amber-100"
            >
              {opt}
            </button>
          ))}
        </div>

        {/* Smaller textarea */}
        <textarea
          rows={2}
          className="w-full border rounded p-2 text-[11px]"
          placeholder="Additional details (optional)"
          value={issue}
          onChange={(e) => setIssue(e.target.value)}
        />

        {/* Footer buttons */}
        <div className="flex justify-end mt-2 gap-2">
          <button
            className="px-3 py-1 text-[11px] border rounded bg-white"
            onClick={() => {
              setOpen(false);
              setIssue("");
            }}
          >
            Cancel
          </button>

          <button
            className="px-3 py-1 text-[11px] bg-amber-600 text-white rounded"
            onClick={submit}
          >
            Save Issue
          </button>
        </div>
      </div>
    )}
  </div>
);

};

export default IssueFlagTrigger;
