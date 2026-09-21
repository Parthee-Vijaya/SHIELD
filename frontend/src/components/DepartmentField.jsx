import React from 'react';
import ChoiceWithOtherField from './ChoiceWithOtherField';
import { KALUNDBORG_DEPARTMENT_GROUPS, KALUNDBORG_DEPARTMENT_SOURCE_URL } from '../config/kalundborgDepartments';

export default function DepartmentField({ name = 'department', label = 'Fagområde', help, ...props }) {
  return <ChoiceWithOtherField {...props} name={name} label={label} groups={KALUNDBORG_DEPARTMENT_GROUPS} customLabel="Angiv andet fagområde" help={help === undefined ? <>Vælg det ansvarlige område. Listen følger <a href={KALUNDBORG_DEPARTMENT_SOURCE_URL} target="_blank" rel="noreferrer noopener">kommunens organisationsoversigt</a>.</> : help} />;
}
