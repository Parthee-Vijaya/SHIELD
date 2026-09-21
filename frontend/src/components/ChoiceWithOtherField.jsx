import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

const Wrapper = styled.div`
  min-width: 0;
  label { display: block; margin-bottom: 9px; color: ${p => p.theme.colors.text}; font-size: 0.84rem; font-weight: 640; line-height: 1.5; }
  select, input { box-sizing: border-box; width: 100%; max-width: 100%; min-width: 0; min-height: 48px; padding: 12px 14px; border: 1px solid ${p => p.$invalid ? p.theme.colors.danger : p.theme.colors.border}; border-radius: 0; background: ${p => p.theme.colors.inputBackground}; color: ${p => p.theme.colors.text}; font: inherit; font-size: 0.88rem; }
  small { display: block; margin-top: 8px; color: ${p => p.theme.colors.textMuted}; font-size: 0.76rem; line-height: 1.5; overflow-wrap: anywhere; }
  .custom-choice { margin-top: 12px; }
  .field-error { margin-top: 6px; color: ${p => p.theme.colors.danger}; font-size: 0.78rem; font-weight: 600; }
`;

const CUSTOM = '__custom_choice__';
const optionValue = option => typeof option === 'string' ? option : option.value;
const optionLabel = option => typeof option === 'string' ? option : option.label;

export default function ChoiceWithOtherField({ name, label, value = '', onChange, options = [], groups = [], errors = {}, help, customLabel = 'Angiv andet', placeholder = 'Vælg…', maxLength = 500 }) {
  const id = `dpia-${name}`;
  const knownValues = [...options, ...groups.flatMap(group => group.options)].map(optionValue);
  const known = knownValues.includes(value);
  const customValue = typeof value === 'string' && value !== '' && !known;
  const [manual, setManual] = useState(customValue);
  const manualValue = useRef(customValue ? value : '');
  const lastEmitted = useRef(null);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    if (customValue) manualValue.current = value;
    setManual(customValue);
  }, [value, known, customValue]);

  const selected = manual ? CUSTOM : known ? value : customValue ? CUSTOM : '';
  const describedBy = [help ? `${id}-help` : '', errors[name] ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  const renderOption = option => <option key={optionValue(option)} value={optionValue(option)}>{optionLabel(option)}</option>;

  return <Wrapper $invalid={Boolean(errors[name])}>
    <label htmlFor={id}>{label}</label>
    <select id={id} value={selected} aria-invalid={Boolean(errors[name])} aria-describedby={describedBy} onChange={event => {
      const next = event.target.value;
      setManual(next === CUSTOM);
      const nextValue = next === CUSTOM ? manualValue.current : next;
      lastEmitted.current = nextValue;
      onChange(name, nextValue);
    }}>
      <option value="">{placeholder}</option>
      {options.map(renderOption)}
      {groups.map(group => <optgroup key={group.label} label={group.label}>{group.options.map(renderOption)}</optgroup>)}
      <option value={CUSTOM}>Andet – skriv selv</option>
    </select>
    {selected === CUSTOM && <div className="custom-choice">
      <label htmlFor={`${id}-custom`}>{customLabel}</label>
      <input id={`${id}-custom`} type="text" value={value} maxLength={maxLength} aria-invalid={Boolean(errors[name])} aria-describedby={describedBy} onChange={event => { manualValue.current = event.target.value; lastEmitted.current = event.target.value; onChange(name, event.target.value); }} />
    </div>}
    {help && <small id={`${id}-help`}>{help}</small>}
    {errors[name] && <div className="field-error" id={`${id}-error`}>{errors[name]}</div>}
  </Wrapper>;
}
