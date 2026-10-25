import {
  AuditIcon,
  Calendar03Icon,
  Clock01Icon,
  DashboardSquare01Icon,
  FileEditIcon,
  FileImportIcon,
  HierarchySquare01Icon,
  Key01Icon,
  LaptopIcon,
  Layers01Icon,
  Notification02Icon,
  ServerStack01Icon,
  Settings02Icon,
  TaskDone01Icon,
  UserGroupIcon,
  UserShield01Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";

/**
 * One icon per section of the app — the sidebar, page titles and dashboard cards use the same one,
 * so a page is recognisable by its icon everywhere. Plain module (no "use client"): server pages import it too.
 */
export const sectionIcons = {
  dashboard: DashboardSquare01Icon,
  tasks: TaskDone01Icon,
  requests: FileEditIcon,
  calendar: Calendar03Icon,
  employees: UserGroupIcon,
  org: HierarchySquare01Icon,
  shifts: Clock01Icon,
  payments: Wallet01Icon,
  templates: Layers01Icon,
  systems: ServerStack01Icon,
  assets: LaptopIcon,
  roles: UserShield01Icon,
  import: FileImportIcon,
  audit: AuditIcon,
  access: Key01Icon,
  settings: Settings02Icon,
  notifications: Notification02Icon,
};

export type SectionIcon = keyof typeof sectionIcons;
