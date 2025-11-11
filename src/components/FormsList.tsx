import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { FileText, Calendar, Loader2, Trash2 } from 'lucide-react';
import type { Database } from '../lib/database.types';

type Form = Database['public']['Tables']['forms']['Row'];

interface FormsListProps {
  onSelectForm: (formId: string) => void;
  refreshTrigger?: number;
}

export function FormsList({ onSelectForm, refreshTrigger }: FormsListProps) {
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadForms();
  }, [refreshTrigger]);

  const loadForms = async () => {
    try {
      const { data, error } = await supabase
        .from('forms')
        .select('*')
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      setForms(data || []);
    } catch (err) {
      console.error('Error loading forms:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, formId: string) => {
    e.stopPropagation();

    if (!confirm('Are you sure you want to delete this form? This action cannot be undone.')) {
      return;
    }

    setDeleting(formId);
    try {
      const { error } = await supabase
        .from('forms')
        .delete()
        .eq('id', formId);

      if (error) throw error;

      setForms(forms.filter(f => f.id !== formId));
    } catch (err) {
      console.error('Error deleting form:', err);
      alert('Failed to delete form. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
      </div>
    );
  }

  if (forms.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="bg-purple-100 w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-lg">
          <FileText className="w-12 h-12 text-purple-600" />
        </div>
        <p className="text-gray-800 font-bold text-lg">No forms uploaded yet</p>
        <p className="text-sm text-purple-600 mt-2 font-medium">Upload your first medical form to get started</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Your Forms</h2>
        <p className="text-sm text-purple-600 mt-1 font-medium">{forms.length} form{forms.length !== 1 ? 's' : ''} saved</p>
      </div>
      <div className="grid gap-3">
        {forms.map((form) => (
          <div
            key={form.id}
            className="bg-white border border-purple-200 rounded-xl p-5 hover:border-purple-400 hover:shadow-lg transition-all w-full group"
          >
            <div className="flex items-start space-x-4">
              <div className="bg-purple-100 p-3 rounded-xl group-hover:bg-purple-200 transition-all shadow-sm">
                <FileText className="w-5 h-5 text-purple-600" />
              </div>
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => onSelectForm(form.id)}
              >
                <h3 className="font-bold text-gray-800 mb-1 truncate">
                  {form.filename}
                </h3>
                {form.extracted_data?.form_name && (
                  <p className="text-sm text-purple-700 mb-2 font-medium">
                    {form.extracted_data.form_name}
                  </p>
                )}
                <div className="flex items-center text-xs text-gray-500">
                  <Calendar className="w-3.5 h-3.5 mr-1.5" />
                  {new Date(form.uploaded_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
              <button
                onClick={(e) => handleDelete(e, form.id)}
                disabled={deleting === form.id}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50"
                title="Delete form"
              >
                {deleting === form.id ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Trash2 className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
