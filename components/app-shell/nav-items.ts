// Sidebar nav — design_handoff README "Screens / views" (1-16), role column from the
// README's Roles and permissions table. Administration is gated by canManagePeople
// (docs/PERMISSIONS.md: "Only admins see Administration"); Workload/Escalations/Reports
// by isHeadOrAdmin (lib/permissions.ts) since members don't get department-wide views.

import {
  AlertTriangle,
  AtSign,
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  HelpCircle,
  Inbox,
  LayoutGrid,
  Send,
  ShieldCheck,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/lib/permissions';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: readonly Role[];
}

const ALL_ROLES: readonly Role[] = ['MEMBER', 'HEAD', 'ADMIN'];
const HEAD_AND_ADMIN: readonly Role[] = ['HEAD', 'ADMIN'];

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Home', href: '/', icon: LayoutGrid, roles: ALL_ROLES },
  { label: 'Inbox', href: '/inbox', icon: Inbox, roles: ALL_ROLES },
  { label: 'Sent', href: '/sent', icon: Send, roles: ALL_ROLES },
  { label: 'Mentions', href: '/mentions', icon: AtSign, roles: ALL_ROLES },
  { label: 'Help Center', href: '/help-center', icon: HelpCircle, roles: ALL_ROLES },
  { label: 'Departments & services', href: '/departments', icon: Building2, roles: ALL_ROLES },
  { label: 'Knowledge Base', href: '/knowledge-base', icon: BookOpen, roles: ALL_ROLES },
  { label: 'Assets', href: '/assets', icon: Boxes, roles: ALL_ROLES },
  { label: 'Workload', href: '/workload', icon: Users, roles: HEAD_AND_ADMIN },
  { label: 'Escalations', href: '/escalations', icon: AlertTriangle, roles: HEAD_AND_ADMIN },
  { label: 'Reports', href: '/reports', icon: BarChart3, roles: HEAD_AND_ADMIN },
  { label: 'Administration', href: '/admin/people', icon: ShieldCheck, roles: ['ADMIN'] },
  { label: 'Profile & Settings', href: '/profile', icon: UserCog, roles: ALL_ROLES },
] as const;
