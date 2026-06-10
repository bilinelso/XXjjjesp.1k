import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

type DatePickerProps = {
  value: string;
  onChange: (date: string) => void;
  label?: string;
  minDate?: string;
  maxDate?: string;
};

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  label,
  minDate,
  maxDate
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return 'Selecione a data';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek, year, month };
  };

  const handleDateSelect = (day: number) => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const selectedDate = new Date(year, month, day);
    const dateString = selectedDate.toISOString().split('T')[0];

    if (minDate && dateString < minDate) return;
    if (maxDate && dateString > maxDate) return;

    onChange(dateString);
    setShowPicker(false);
  };

  const changeMonth = (offset: number) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1));
  };

  const renderCalendar = () => {
    const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentMonth);
    const days = [];
    const today = new Date();
    const minDateObj = minDate ? new Date(minDate) : null;
    const maxDateObj = maxDate ? new Date(maxDate) : null;

    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="w-10 h-10" />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(year, month, day);
      const dateString = dateObj.toISOString().split('T')[0];
      const isToday = dateObj.toDateString() === today.toDateString();
      const isSelected = dateString === value;
      const isDisabled = Boolean((minDateObj && dateObj < minDateObj) || (maxDateObj && dateObj > maxDateObj));

      days.push(
        <button
          key={day}
          type="button"
          onClick={() => !isDisabled && handleDateSelect(day)}
          disabled={isDisabled}
          className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-medium transition-colors ${
            isSelected
              ? 'bg-blue-600 text-white'
              : isToday
              ? 'bg-blue-100 text-blue-600'
              : isDisabled
              ? 'text-gray-300 cursor-not-allowed'
              : 'hover:bg-gray-100 text-gray-700'
          }`}
        >
          {day}
        </button>
      );
    }

    return days;
  };

  return (
    <div ref={pickerRef} className="relative">
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      )}
      <button
        type="button"
        onClick={() => setShowPicker(!showPicker)}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 flex items-center justify-between hover:border-blue-400 transition-colors bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        <div className="flex items-center gap-2">
          <Calendar className="text-gray-500" size={18} />
          <span className={value ? 'text-gray-900' : 'text-gray-400'}>
            {formatDateDisplay(value)}
          </span>
        </div>
      </button>

      {showPicker && (
        <div className="absolute z-50 mt-2 bg-white border-2 border-gray-200 rounded-lg shadow-xl p-4 w-full min-w-[320px]">
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="font-semibold text-gray-900">
              {currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
              <div key={day} className="w-10 h-8 flex items-center justify-center text-xs font-semibold text-gray-600">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {renderCalendar()}
          </div>
        </div>
      )}
    </div>
  );
};
