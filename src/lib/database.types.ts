export interface Database {
  public: {
    Tables: {
      forms: {
        Row: {
          id: string;
          filename: string;
          uploaded_at: string;
          extracted_data: FormData;
          edited_data: FormData;
          created_at: string;
          updated_at: string;
          file_path: string | null;
          file_type: string | null;
          user_id: string | null;
        };
        Insert: {
          id?: string;
          filename: string;
          uploaded_at?: string;
          extracted_data?: FormData;
          edited_data?: FormData;
          created_at?: string;
          updated_at?: string;
          file_path?: string | null;
          file_type?: string | null;
          user_id?: string | null;
        };
        Update: {
          id?: string;
          filename?: string;
          uploaded_at?: string;
          extracted_data?: FormData;
          edited_data?: FormData;
          created_at?: string;
          updated_at?: string;
          file_path?: string | null;
          file_type?: string | null;
          user_id?: string | null;
        };
      };
    };
  };
}

export interface FormSection {
  section_name: string;
  fields: Record<string, string | number | boolean>;
}

export interface FormData {
  form_name?: string;
  sections?: FormSection[];
  fields?: Record<string, string | number | boolean>;
}

export interface FormField {
  label: string;
  value: string;
  type?: 'text' | 'number' | 'checkbox' | 'date';
}
