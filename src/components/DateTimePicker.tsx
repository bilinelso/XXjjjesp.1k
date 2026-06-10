import React, { useState, useRef, useEffect } from 'react';
import { Calendar, Clock, ChevronLeft, ChevronRight } from 'lucide-react';

type DateTimePickerProps = {
  date: string;
  time: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  minDate?: string;
};

export const DateTimePicker: React.FC<DateTimePickerProps> = ({
  date,
  time,
  onDateChange,
  onTimeChange,
  minDate
}) => {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedHour, setSelectedHour] = useState('09');
  const [selectedMinute, setSelectedMinute] = useState('00');

  const datePickerRef = useRef<HTMLDivElement>(null);
  const timePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (time) {
      const [h, m] = time.split(':');
      setSelectedHour(h);
      setSelectedMinute(m);
    }
  }, [time]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
      if (timePickerRef.current && !timePickerRef.current.contains(event.target as Node)) {
        setShowTimePicker(false);
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

  const formatTimeDisplay = (timeStr: string) => {
    if (!timeStr) return 'Selecione o horário';
    return timeStr;
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

    onDateChange(dateString);
    setShowDatePicker(false);
  };

  const handleTimeSelect = () => {
    const timeString = `${selectedHour}:${selectedMinute}`;
    onTimeChange(timeString);
    setShowTimePicker(false);
  };

  const changeMonth = (offset: number) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1));
  };

  const renderCalendar = () => {
    const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentMonth);
    const days = [];
    const today = new Date();
    const minDateObj = minDate ? new Date(minDate) : null;

    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="w-10 h-10" />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(year, month, day);
      const dateString = dateObj.toISOString().split('T')[0];
      const isToday = dateObj.toDateString() === today.toDateString();
      const isSelected = dateString === date;
      const isDisabled = Boolean(minDateObj && dateObj < minDateObj);

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

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

  return (
    <div className="space-y-4">
      <div ref={datePickerRef} className="relative">
        <label className="block text-sm font-medium mb-2">Data</label>
        <button
          type="button"
          onClick={() => setShowDatePicker(!showDatePicker)}
          className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 flex items-center justify-between hover:border-blue-400 transition-colors bg-white"
        >
          <div className="flex items-center gap-3">
            <Calendar className="text-gray-500" size={20} />
            <span className={date ? 'text-gray-900' : 'text-gray-400'}>
              {formatDateDisplay(date)}
            </span>
          </div>
        </button>

        {showDatePicker && (
          <div className="absolute z-50 mt-2 bg-white border-2 border-gray-200 rounded-lg shadow-xl p-4 w-full">
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

      <div ref={timePickerRef} className="relative">
        <label className="block text-sm font-medium mb-2">Horário</label>
        <button
          type="button"
          onClick={() => setShowTimePicker(!showTimePicker)}
          className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 flex items-center justify-between hover:border-blue-400 transition-colors bg-white"
        >
          <div className="flex items-center gap-3">
            <Clock className="text-gray-500" size={20} />
            <span className={time ? 'text-gray-900' : 'text-gray-400'}>
              {formatTimeDisplay(time)}
            </span>
          </div>
        </button>

        {showTimePicker && (
          <div className="absolute z-50 mt-2 bg-white border-2 border-gray-200 rounded-lg shadow-xl p-4 w-full">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2 text-center">Hora</label>
                <div className="border-2 border-gray-200 rounded-lg p-2 max-h-48 overflow-y-auto">
                  {hours.map(hour => (
                    <button
                      key={hour}
                      type="button"
                      onClick={() => setSelectedHour(hour)}
                      className={`w-full px-3 py-2 rounded text-sm font-medium transition-colors ${
                        selectedHour === hour
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      {hour}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2 text-center">Minuto</label>
                <div className="border-2 border-gray-200 rounded-lg p-2 max-h-48 overflow-y-auto">
                  {minutes.map(minute => (
                    <button
                      key={minute}
                      type="button"
                      onClick={() => setSelectedMinute(minute)}
                      className={`w-full px-3 py-2 rounded text-sm font-medium transition-colors ${
                        selectedMinute === minute
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      {minute}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleTimeSelect}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors"
            >
              Confirmar: {selectedHour}:{selectedMinute}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
