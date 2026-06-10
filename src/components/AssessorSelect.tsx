import { useState, useEffect, useRef } from 'react';
import { Check, ChevronDown, X, Users } from 'lucide-react';

export type Assessor = {
  id: string;
  nome: string;
  ativo: boolean;
};

type AssessorSelectProps = {
  assessores: Assessor[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
};

export const AssessorSelect = ({
  assessores,
  selectedIds,
  onChange,
  disabled = false,
  placeholder = 'Selecionar assessores'
}: AssessorSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedAssessores = assessores.filter(a => selectedIds.includes(a.id));

  const toggleAssessor = (assessorId: string) => {
    if (selectedIds.includes(assessorId)) {
      onChange(selectedIds.filter(id => id !== assessorId));
    } else {
      onChange([...selectedIds, assessorId]);
    }
  };

  const removeAssessor = (e: React.MouseEvent, assessorId: string) => {
    e.stopPropagation();
    onChange(selectedIds.filter(id => id !== assessorId));
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full min-h-[42px] px-3 py-2 border rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
          disabled
            ? 'bg-gray-100 cursor-not-allowed'
            : isOpen
            ? 'border-blue-500 ring-2 ring-blue-100'
            : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <div className="flex-1 flex flex-wrap gap-1">
          {selectedAssessores.length === 0 ? (
            <span className="text-gray-400">{placeholder}</span>
          ) : (
            selectedAssessores.map(assessor => (
              <span
                key={assessor.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 text-sm rounded"
              >
                {assessor.nome}
                {!disabled && (
                  <button
                    onClick={(e) => removeAssessor(e, assessor.id)}
                    className="hover:bg-blue-200 rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))
          )}
        </div>
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
          {assessores.length === 0 ? (
            <div className="p-3 text-center text-gray-500 text-sm">
              <Users className="w-5 h-5 mx-auto mb-1 opacity-50" />
              Nenhum assessor disponivel
            </div>
          ) : (
            assessores.map(assessor => {
              const isSelected = selectedIds.includes(assessor.id);
              return (
                <div
                  key={assessor.id}
                  onClick={() => toggleAssessor(assessor.id)}
                  className={`px-3 py-2 cursor-pointer flex items-center justify-between transition-colors ${
                    isSelected
                      ? 'bg-blue-50 text-blue-800'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <span>{assessor.nome}</span>
                  {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
