export const INVESTMENT_CATEGORIES = [
  { value: 'Strate Insider', label: 'Strate Insider', minValue: 4000 },
  { value: 'Strate Advance', label: 'Strate Advance', minValue: 10000 },
  { value: 'Strate Prime', label: 'Strate Prime', minValue: 20000 },
  { value: 'Strate Private', label: 'Strate Private', minValue: 50000 },
  { value: 'Strate Apex', label: 'Strate Apex', minValue: 100000 },
  { value: 'Strate Legacy', label: 'Strate Legacy', minValue: 1000000 },
];

export const getCategoryByValue = (valorDeposito: number): string => {
  if (!valorDeposito || valorDeposito <= 0) {
    return '';
  }

  const sortedCategories = [...INVESTMENT_CATEGORIES].sort((a, b) => b.minValue - a.minValue);

  for (const category of sortedCategories) {
    if (valorDeposito >= category.minValue) {
      return category.value;
    }
  }

  return INVESTMENT_CATEGORIES[0].value;
};

export const formatCategoryDisplay = (minValue: number): string => {
  if (minValue >= 1000001) {
    return `$${(minValue / 1000).toLocaleString('pt-BR')}`;
  }
  return ``;
};
