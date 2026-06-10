import React from 'react';

type LoadingSpinnerProps = {
  size?: 'sm' | 'md' | 'lg';
  color?: 'blue' | 'white' | 'gray';
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  color = 'blue'
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  const colorClasses = {
    blue: 'border-blue-600 border-t-transparent',
    white: 'border-white border-t-transparent',
    gray: 'border-gray-400 border-t-transparent'
  };

  return (
    <div
      className={`${sizeClasses[size]} border-2 ${colorClasses[color]} rounded-full animate-spin`}
    />
  );
};

type LoadingBarProps = {
  className?: string;
};

export const LoadingBar: React.FC<LoadingBarProps> = ({ className = '' }) => {
  return (
    <div className={`w-full h-1 bg-gray-200 overflow-hidden rounded-full ${className}`}>
      <div className="h-full bg-gradient-to-r from-blue-500 via-blue-600 to-blue-500 animate-loading-bar" />
    </div>
  );
};

type LoadingOverlayProps = {
  message?: string;
};

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  message = 'Carregando...'
}) => {
  return (
    <div className="absolute inset-0 bg-white flex flex-col items-center justify-center z-10 rounded-lg">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-gray-200 rounded-full" />
          <div className="absolute inset-0 w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-gray-600 font-medium">{message}</p>
        <LoadingBar className="w-48" />
      </div>
    </div>
  );
};

type ButtonLoadingProps = {
  children: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
};

export const ButtonLoading: React.FC<ButtonLoadingProps> = ({
  children,
  loading = false,
  disabled = false,
  onClick,
  className = '',
  type = 'button',
  variant = 'primary'
}) => {
  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-400',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-700 disabled:bg-gray-100',
    danger: 'bg-red-600 hover:bg-red-700 text-white disabled:bg-red-400',
    success: 'bg-green-600 hover:bg-green-700 text-white disabled:bg-green-400'
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`relative px-4 py-2 rounded transition-all duration-200 flex items-center justify-center gap-2 ${variantClasses[variant]} ${
        loading ? 'cursor-wait' : disabled ? 'cursor-not-allowed' : ''
      } ${className}`}
    >
      {loading && (
        <LoadingSpinner
          size="sm"
          color={variant === 'secondary' ? 'gray' : 'white'}
        />
      )}
      <span className={loading ? 'opacity-70' : ''}>{children}</span>
    </button>
  );
};
