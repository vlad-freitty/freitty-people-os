import {
  Calendar03Icon,
  CheckmarkCircle02Icon,
  File01Icon,
  FileEditIcon,
  GiftIcon,
  GitBranchIcon,
  Key01Icon,
  PencilEdit02Icon,
  ServerStack01Icon,
  TaskDone01Icon,
  UserAccountIcon,
  UserAdd01Icon,
  UserCircleIcon,
  UserGroupIcon,
  UserIcon,
  UserRemove01Icon,
  UserSearch01Icon,
  UserShield01Icon,
} from "@hugeicons/core-free-icons";

/** Icons of template kinds, step types and assignee rules — shared by the template list and the editor. */
export const kindIcons = {
  generic: FileEditIcon,
  hiring: UserSearch01Icon,
  onboarding: UserAdd01Icon,
  access: Key01Icon,
  offboarding: UserRemove01Icon,
  absence: Calendar03Icon,
  bonus: GiftIcon,
} as const;

export const kindTones = {
  generic: "neutral",
  hiring: "blue",
  onboarding: "ok",
  access: "warn",
  offboarding: "red",
  absence: "blue",
  bonus: "warn",
} as const;

export const stepIcons = {
  approve: CheckmarkCircle02Icon,
  task: TaskDone01Icon,
  fill: PencilEdit02Icon,
  document: File01Icon,
  child_request: GitBranchIcon,
} as const;

export const ruleIcons = {
  person: UserIcon,
  initiator: UserCircleIcon,
  initiator_dept_head: UserGroupIcon,
  subject_dept_head: UserGroupIcon,
  subject_manager: UserAccountIcon,
  system_owner: ServerStack01Icon,
  role_first_free: UserShield01Icon,
} as const;
