export interface NewTicketField {
  label: string;
  type: 'text' | 'select' | 'textarea' | 'checkbox';
  required: boolean;
  options?: string[];
}

export interface NewTicketServiceType {
  id: string;
  departmentId: string;
  name: string;
  description: string;
  defaultPriority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  fields: NewTicketField[];
}

export interface NewTicketDepartment {
  id: string;
  slug: string;
  name: string;
  confidentialByDefault: boolean;
}

export interface NewTicketData {
  departments: NewTicketDepartment[];
  serviceTypes: NewTicketServiceType[];
}

export type Priority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface NewTicketDraft {
  description: string;
  serviceTypeId: string;
  subject: string;
  priority: Priority;
  confidential: boolean;
  fields: Record<string, unknown>;
}

export const EMPTY_DRAFT: NewTicketDraft = {
  description: '',
  serviceTypeId: '',
  subject: '',
  priority: 'MEDIUM',
  confidential: false,
  fields: {},
};
