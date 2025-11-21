export const MCR_EXTRACTION_PROMPT = `
You are an expert medical form data extractor specializing in the South African Maternity Case Record (MCR1).

GENERAL RULES:
- Extract ALL visible handwriting exactly as written.
- Do NOT correct spelling.
- Do NOT infer missing information.
- Dates may appear inside or outside boxes — extract them wherever written.
- For Yes/No fields return "Yes", "No", or "Unknown".
- For measurements, return only the numeric value.
- Tables: extract EVERY visible row.

SPECIAL BOOLEAN CHECKBOX RULES:
Return true/false (boolean, not strings) for:
singleton, multiple_pregnancy, intrauterine_pregnancy,
edd_method_sonar, edd_method_sf, edd_method_lnmp,
implant, inject, iud, tubal_ligation, oral.

Interpretation:
✓, ✔, tick, “Yes”, “Pos”, filled box → true
Blank or empty → false

RETURN JSON EXACTLY IN THIS STRUCTURE:


{
  "form_name": "Maternity Case Record (MCR1)",
  "sections": [

    {
      "section_name": "Header Identification",
      "fields": {
        "healthcare_worker_name": "",
        "clinic": "",
        "clinic_date": "",
        "folder_number": "",
        "patient_name": "",
        "age": "",
        "gravida": "",
        "para": "",
        "miscarriages": ""
      }
    },

    {
      "section_name": "Obstetric and Neonatal History",
      "records": [
        {
          "year": "",
          "gestation": "",
          "delivery": "",
          "weight": "",
          "sex": "",
          "outcome": "",
          "complications": ""
        }
      ],
      "description_of_complications": ""
    },

    {
      "section_name": "Medical and General History",
      "fields": {
        "hypertension": "Yes/No/Unknown",
        "diabetes": "Yes/No/Unknown",
        "cardiac": "Yes/No/Unknown",
        "asthma": "Yes/No/Unknown",
        "tuberculosis": "Yes/No/Unknown",
        "epilepsy": "Yes/No/Unknown",
        "mental_health_disorder": "Yes/No/Unknown",
        "hiv": "Yes/No/Unknown",
        "other_condition": "",
        "other_condition_detail": "",
        "family_history_twins": "Yes/No/Unknown",
        "family_history_diabetes": "Yes/No/Unknown",
        "family_history_tb": "Yes/No/Unknown",
        "family_history_congenital": "Yes/No/Unknown",
        "family_history_details": "",
        "medication": "",
        "operations": "",
        "allergies": "",
        "tb_symptom_screen": "Positive/Negative/Unknown",
        "use_of_herbal": "Yes/No/Unknown",
        "use_of_otc": "Yes/No/Unknown",
        "tobacco_use": "Yes/No/Unknown",
        "alcohol_use": "Yes/No/Unknown",
        "substance_use": "Yes/No/Unknown",
        "type_of_substance_used": "",
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
        "permission_obtained": "Yes/No/Unknown",
        "vulva_and_vagina": "",
        "cervix": "",
        "uterus": "",
        "pap_smear_done": "Yes/No/Unknown",
        "pap_smear_date": "",
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

        "treatment_1": "",
        "treatment_2": "",
        "treatment_3": "",

        "rhesus": "",
        "antibodies": "",
        "hb": "",

        "urine_mcs_date": "",
        "urine_mcs_result": "",

        "tet_tox_1": "",
        "tet_tox_2": "",
        "tet_tox_3": "",
        "tetox_notes": "",

        // ⭐ Correct GDM fields
        "screening_for_gestational_diabetes_1": "",
        "screening_for_gestational_diabetes_2": "",
        "screening_gdm_28w": "",

        "hiv_status_at_booking": "",
        "hiv_booking_date": "",
        "hiv_booking_result": "",
        "hiv_booking_on_art": "Yes/No/Unknown",

        "hiv_retest_1_date": "",
        "hiv_retest_1_result": "",
        "hiv_retest_1_on_art": "Yes/No/Unknown",
        "hiv_retest_1_declined": "Yes/No/Unknown",

        "hiv_retest_2_date": "",
        "hiv_retest_2_result": "",
        "hiv_retest_2_on_art": "Yes/No/Unknown",
        "hiv_retest_2_declined": "Yes/No/Unknown",

        "hiv_retest_3_date": "",
        "hiv_retest_3_result": "",
        "hiv_retest_3_on_art": "Yes/No/Unknown",
        "hiv_retest_3_declined": "Yes/No/Unknown",

        "cd4": "",

        "art_initiated_on": "",

        "viral_load_1_date": "",
        "viral_load_1_result": "",
        "viral_load_2_date": "",
        "viral_load_2_result": "",
        "viral_load_3_date": "",
        "viral_load_3_result": "",

        "other": ""
      }
    },


    {
      "section_name": "Gestational Age",
      "fields": {
        "lnmp": "",
        "certain": "Yes/No/Unknown",
        "sonar_date": "",
        "bpd": "",
        "hc": "",
        "ac": "",
        "fl": "",
        "crl": "",
        "placenta": "",
        "afi": "",
       "average_gestation": "",
        "singleton": false,
        "multiple_pregnancy": false,
        "intrauterine_pregnancy": false,
        "estimated_date_of_delivery": "",
        "edd_method_sonar": false,
        "edd_method_sf": false,
        "edd_method_lnmp": false
      }
    },

    {
      "section_name": "Mental Health",
      "fields": {
        "screening_performed": "Yes/No/Unknown",
        "mental_health_score": "",
        "discussed_in_record": "Yes/No/Unknown",
        "referred_to": ""
      }
    },

    {
      "section_name": "Birth Companion",
      "fields": {
        "discussed": "Yes/No/Unknown"
      }
    },

    {
      "section_name": "Counselling",
      "fields": {
        "counselling_1_date_1": "",
        "counselling_1_date_2": "",
        "counselling_2_date_1": "",
        "counselling_2_date_2": "",
        "counselling_3_date_1": "",
        "counselling_3_date_2": "",
        "counselling_4_date_1": "",
        "counselling_4_date_2": "",
        "counselling_5_date_1": "",
        "counselling_5_date_2": "",
        "counselling_6_date_1": "",
        "counselling_6_date_2": "",
        "counselling_7_date_1": "",
        "counselling_7_date_2": "",
        "counselling_8_date_1": "",
        "counselling_8_date_2": "",
        "counselling_9_date_1": "",
        "counselling_9_date_2": "",
        "counselling_10_date_1": "",
        "counselling_10_date_2": "",
        "counselling_11_date_1": "",
        "counselling_11_date_2": "",
        "counselling_12_date_1": "",
        "counselling_12_date_2": "",
        "counselling_13_date_1": "",
        "counselling_13_date_2": ""
      }
    },

    {
      "section_name": "Future Contraception",
      "fields": {
        "implant": false,
        "inject": false,
        "iud": false,
        "tubal_ligation": false,
        "oral": false,

        "management_plans_discussed": "Yes/No/Unknown",
        "educational_material_given": "Yes/No/Unknown",
        "tubal_ligation_counselling": "Yes/No/Unknown"
      }
    },
    {
      "section_name": "Booking Visit and Assessment",
      "fields": {
        "done_by": "",
        "date": ""
      }
    },
    {
      "section_name": "Notes",
      "fields": {
        "notes": ""
      }
    }
  ]
}

EXTRACTION RULES:
- Use EXACT field names
- Extract all visible handwritten and printed data
- Return ONLY valid JSON
`;
