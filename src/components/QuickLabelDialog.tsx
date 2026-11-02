import React, { useState, useEffect } from 'react';
import { Type, Check, X } from 'lucide-react';

export interface LabelDialogRequest {
  title: string;
  defaultValue: string;
  placeholder: string;
  onConfirm: (value: string) => void;
}

interface QuickLabelDialogProps {
  request: LabelDialogRequest | null;
  onClose: () => void;
  nextSequentialSuggestion?: string;
}

export const QuickLabelDialog: React.FC<QuickLabelDialogProps> = ({
  request,
  onClose,
  nextSequentialSuggestion,
}) => {
  const [text, setText] = useState('');

  useEffect(() => {
    if (request) {
      setText(request.defaultValue || '');
    }
  }, [request]);

  if (!request) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      request.onConfirm(text.trim());
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1100] bg-slate-950/45 flex items-center justify-center p-4 no-print">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden"
      >
        <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold">
            <Type className="w-4 h-4 text-blue-400" />
            <span>{request.title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <input
            type="text"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={request.placeholder}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold text-slate-900 focus:border-blue-500 focus:outline-none"
          />

          <div className="flex flex-wrap gap-1.5">
            {nextSequentialSuggestion && (
              <button
                type="button"
                onClick={() => setText(nextSequentialSuggestion)}
                className="px-2 py-0.5 rounded bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[11px] font-semibold"
              >
                {nextSequentialSuggestion}
              </button>
            )}
            {['PRAÇA', 'ÁREA VERDE', 'ESCOLA', 'UNIDADE DE SAÚDE'].map((sug) => (
              <button
                key={sug}
                type="button"
                onClick={() => setText(sug)}
                className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium"
              >
                {sug}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Confirmar</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
