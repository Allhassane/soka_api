export const meta = {
  name: 'activity-frontend',
  description: 'Build the full activity module frontend (types, services, modal updates, new tabs, settings page)',
  phases: [
    { title: 'Foundation', detail: 'Update types/activity.ts, services/activity.ts, lib/validation.ts' },
    { title: 'Components', detail: 'ActivityTypeModal, ActivityTypeTable, update ActivityModal, ActivityTable' },
    { title: 'Pages', detail: 'parametre/types-activite page + detail page tabs (Comités, Quotas)' },
  ],
};

const BASE = 'C:/MesProjetsWeb/ProjetsNestJS/digitalisation_soka/soka_web';

// ─── Phase 1: Foundation ───────────────────────────────────────────────────
phase('Foundation');

const [typesResult, servicesResult, validationResult] = await parallel([

  () => agent(`Update the file ${BASE}/types/activity.ts.

CURRENT FILE CONTENT (read it first to see what exists):
- ActivityTypeAPI: only has uuid, name, description, status
- ActivityAPI: missing capacity, is_recurring, recurrence_rule, target_departments
- CreateActivityData: missing same fields

REQUIRED CHANGES:
1. Update ActivityTypeAPI to add: family ('traditionnelle'|'sporadique'), subcategory (string|null), requires_quota (boolean), requires_committee (boolean), default_recurrence_rule (string|null), execution_level (string|null)
2. Update ActivityAPI to add: capacity (number|null), is_recurring (boolean), recurrence_rule (string|null), target_departments (string[])
3. Update CreateActivityData to add: capacity? (number), is_recurring? (boolean), recurrence_rule? (string), target_departments? (string[])
4. Add these new interfaces at the end of the file:

export interface ActivityQuotaAPI {
  uuid: string;
  activity_uuid: string;
  structure_uuid: string;
  structure?: { uuid: string; name: string } | null;
  quota_allocated: number;
  quota_used: number;
  admin_uuid?: string;
  created_at?: string;
}

export interface ActivityQuotaSummary {
  activity_uuid: string;
  total_allocated: number;
  total_used: number;
  remaining: number;
  by_structure: Array<{
    uuid: string;
    structure_uuid: string;
    structure_name: string | null;
    quota_allocated: number;
    quota_used: number;
    remaining: number;
  }>;
}

export interface ActivityCommitteeAPI {
  uuid: string;
  activity_uuid: string;
  name: string;
  description: string | null;
  status: string;
  members?: ActivityCommitteeMemberAPI[];
  created_at?: string;
}

export interface ActivityCommitteeMemberAPI {
  uuid: string;
  committee_uuid: string;
  member_uuid: string;
  member?: { uuid: string; firstname: string; lastname: string; matricule?: string; gender?: string } | null;
  role: 'president' | 'secretaire' | 'membre';
  commission: string | null;
  admin_uuid?: string;
}

export interface CreateQuotaData {
  structure_uuid: string;
  quota_allocated: number;
}

export interface UpdateQuotaData {
  quota_allocated?: number;
  quota_used?: number;
}

export interface CreateCommitteeData {
  name: string;
  description?: string;
}

export interface UpdateCommitteeData {
  name?: string;
  description?: string;
  status?: string;
}

export interface CreateCommitteeMemberData {
  member_uuid: string;
  role: 'president' | 'secretaire' | 'membre';
  commission?: string;
}

export interface UpdateCommitteeMemberData {
  role?: 'president' | 'secretaire' | 'membre';
  commission?: string;
}

Write the complete updated file. Read the current file first.`, { label: 'update-types', phase: 'Foundation' }),

  () => agent(`Update the file ${BASE}/services/activity.ts.

READ THE CURRENT FILE FIRST at ${BASE}/services/activity.ts.

ADD these new functions at the end (after the existing ones):

// ── QUOTAS ──
export const getActivityQuotas = async (activityUuid: string): Promise<import('@/types/activity').ActivityQuotaAPI[]> => {
  const response = await axiosAuth.get(\`/activities/\${activityUuid}/quotas\`);
  const data = response.data?.data ?? response.data;
  return Array.isArray(data) ? data : [];
};

export const getActivityQuotaSummary = async (activityUuid: string): Promise<import('@/types/activity').ActivityQuotaSummary> => {
  const response = await axiosAuth.get(\`/activities/\${activityUuid}/quotas/summary\`);
  return response.data?.data ?? response.data;
};

export const createActivityQuota = async (activityUuid: string, data: import('@/types/activity').CreateQuotaData): Promise<import('@/types/activity').ActivityQuotaAPI> => {
  const response = await axiosAuth.post(\`/activities/\${activityUuid}/quotas\`, data);
  return response.data?.data ?? response.data;
};

export const updateActivityQuota = async (quotaUuid: string, data: import('@/types/activity').UpdateQuotaData): Promise<import('@/types/activity').ActivityQuotaAPI> => {
  const response = await axiosAuth.put(\`/activities/quotas/\${quotaUuid}\`, data);
  return response.data?.data ?? response.data;
};

export const deleteActivityQuota = async (quotaUuid: string): Promise<void> => {
  await axiosAuth.delete(\`/activities/quotas/\${quotaUuid}\`);
};

// ── COMITÉS ──
export const getActivityCommittees = async (activityUuid: string): Promise<import('@/types/activity').ActivityCommitteeAPI[]> => {
  const response = await axiosAuth.get(\`/activities/\${activityUuid}/committees\`);
  const data = response.data?.data ?? response.data;
  return Array.isArray(data) ? data : [];
};

export const createActivityCommittee = async (activityUuid: string, data: import('@/types/activity').CreateCommitteeData): Promise<import('@/types/activity').ActivityCommitteeAPI> => {
  const response = await axiosAuth.post(\`/activities/\${activityUuid}/committees\`, data);
  return response.data?.data ?? response.data;
};

export const updateActivityCommittee = async (committeeUuid: string, data: import('@/types/activity').UpdateCommitteeData): Promise<import('@/types/activity').ActivityCommitteeAPI> => {
  const response = await axiosAuth.put(\`/activities/committees/\${committeeUuid}\`, data);
  return response.data?.data ?? response.data;
};

export const deleteActivityCommittee = async (committeeUuid: string): Promise<void> => {
  await axiosAuth.delete(\`/activities/committees/\${committeeUuid}\`);
};

// ── MEMBRES COMITÉ ──
export const getCommitteeMembers = async (committeeUuid: string): Promise<import('@/types/activity').ActivityCommitteeMemberAPI[]> => {
  const response = await axiosAuth.get(\`/activities/committees/\${committeeUuid}/members\`);
  const data = response.data?.data ?? response.data;
  return Array.isArray(data) ? data : [];
};

export const addCommitteeMember = async (committeeUuid: string, data: import('@/types/activity').CreateCommitteeMemberData): Promise<import('@/types/activity').ActivityCommitteeMemberAPI> => {
  const response = await axiosAuth.post(\`/activities/committees/\${committeeUuid}/members\`, data);
  return response.data?.data ?? response.data;
};

export const updateCommitteeMember = async (memberUuid: string, data: import('@/types/activity').UpdateCommitteeMemberData): Promise<import('@/types/activity').ActivityCommitteeMemberAPI> => {
  const response = await axiosAuth.put(\`/activities/committees/members/\${memberUuid}\`, data);
  return response.data?.data ?? response.data;
};

export const removeCommitteeMember = async (memberUuid: string): Promise<void> => {
  await axiosAuth.delete(\`/activities/committees/members/\${memberUuid}\`);
};

Write the complete updated file preserving all existing functions and adding the new ones.`, { label: 'update-services', phase: 'Foundation' }),

  () => agent(`In the file ${BASE}/lib/validation.ts, add the following new schemas AFTER the existing activityParticipantFormSchema section (around line 910).

READ THE FILE FIRST to find the exact insertion point (after line "export type ActivityParticipantFormData = z.infer<...>").

Add these schemas:

/* Activity Type */
export const activityTypeFormSchema = z.object({
  name: z.string().min(1, "Le libellé est requis").max(191),
  description: z.string().optional(),
  family: z.enum(["traditionnelle", "sporadique"], {
    required_error: "La famille est requise",
  }),
  subcategory: z.enum([
    "mensuelle_departement",
    "grande_commemoration",
    "zandakai",
    "sporadique_nationale",
    "sporadique_locale",
  ]).optional(),
  requires_quota: z.boolean().default(false),
  requires_committee: z.boolean().default(false),
  default_recurrence_rule: z.string().max(255).optional(),
  execution_level: z.string().max(64).optional(),
  status: z.string().optional(),
});
export type ActivityTypeFormData = z.infer<typeof activityTypeFormSchema>;

/* Activity Quota */
export const activityQuotaFormSchema = z.object({
  structure_uuid: z.string().min(1, "La structure est requise"),
  quota_allocated: z.coerce.number().int().min(1, "Le quota doit être au moins 1"),
});
export type ActivityQuotaFormData = z.infer<typeof activityQuotaFormSchema>;

/* Activity Committee */
export const activityCommitteeFormSchema = z.object({
  name: z.string().min(1, "Le nom du comité est requis").max(191),
  description: z.string().optional(),
});
export type ActivityCommitteeFormData = z.infer<typeof activityCommitteeFormSchema>;

/* Activity Committee Member */
export const activityCommitteeMemberFormSchema = z.object({
  member_uuid: z.string().min(1, "Le membre est requis"),
  role: z.enum(["president", "secretaire", "membre"], {
    required_error: "Le rôle est requis",
  }),
  commission: z.string().max(100).optional(),
});
export type ActivityCommitteeMemberFormData = z.infer<typeof activityCommitteeMemberFormSchema>;

Also add capacity, is_recurring, recurrence_rule to activityFormSchema.
Find the activityFormSchema (around line 802) and add these fields:
  capacity: z.coerce.number().int().min(1).optional(),
  is_recurring: z.boolean().default(false),
  recurrence_rule: z.string().max(255).optional(),
  target_departments: z.array(z.string()).default([]),

And in ActivityFormData defaultValues in ActivityModal they will need to be added too, but just handle the validation schema here.

Write the complete updated validation.ts file. Read the current file first to preserve all existing schemas.`, { label: 'update-validation', phase: 'Foundation' }),
]);

// ─── Phase 2: Components ───────────────────────────────────────────────────
phase('Components');

const [modalResult, tableResult, actTypeModalResult, actTypeTableResult] = await parallel([

  () => agent(`Update the file ${BASE}/components/form/ActivityModal.tsx.

READ THE FILE FIRST at ${BASE}/components/form/ActivityModal.tsx.

ADD these 3 new fields to the form, AFTER the "Heure de Gongyo" field and BEFORE "Personnes concernées":

1. Capacité (optional number):
<div className="flex flex-col gap-2">
  <Label>Capacité du lieu <span className="text-default-400 text-xs">(optionnel)</span></Label>
  <Input type="number" min={1} {...register('capacity', { valueAsNumber: true })} placeholder="Nombre de places" />
  {errors.capacity && <p className="text-sm text-red-600">{errors.capacity.message}</p>}
</div>

2. Activité récurrente (boolean switch + recurrence_rule text):
A row with: a checkbox/switch "Activité récurrente" and when checked shows a text input for recurrence rule.

Use the Controller pattern for is_recurring (checkbox input or a simple <input type="checkbox">).
Show recurrence_rule input only when is_recurring is true.

UPDATE the form defaultValues to include:
  capacity: undefined,
  is_recurring: false,
  recurrence_rule: '',
  target_departments: [],

UPDATE the useEffect that fills data from initialData to include:
  capacity: initialData.capacity ?? undefined,
  is_recurring: initialData.is_recurring ?? false,
  recurrence_rule: initialData.recurrence_rule ?? '',
  target_departments: initialData.target_departments ?? [],

Import the updated types from validation: ActivityFormData already covers this since we updated the schema.

Use the Checkbox component from @/components/ui/checkbox if available, otherwise use a native input type="checkbox".

Write the complete updated file.`, { label: 'update-activity-modal', phase: 'Components' }),

  () => agent(`Update the file ${BASE}/components/data-table/ActivityTable.tsx.

READ THE FILE FIRST.

CHANGES needed:
1. Replace the "Type" column (accessorKey: 'type') with a smarter version that shows activityType.name if available:
{
  id: 'type',
  header: 'Type',
  cell: ({ row }) => {
    const act = row.original;
    const typeName = act.activityType?.name ?? act.type ?? '-';
    return <span className="text-sm">{typeName}</span>;
  },
},

2. Remove the "Description" column (it's not useful in a list).

3. In the onEditData call, add the new fields to the edit data object:
  activity_type_uuid: activity.activity_type_uuid ?? '',
  capacity: activity.capacity ?? undefined,
  is_recurring: activity.is_recurring ?? false,
  recurrence_rule: activity.recurrence_rule ?? '',
  target_departments: activity.target_departments ?? [],

Write the complete updated file.`, { label: 'update-activity-table', phase: 'Components' }),

  () => agent(`Create a new file ${BASE}/components/form/ActivityTypeModal.tsx.

This is a modal for creating/editing activity types. Model it after ${BASE}/components/form/LevelModal.tsx (read it first for the pattern).

The modal should:
- Use react-hook-form + zodResolver with activityTypeFormSchema from @/lib/validation
- Fields:
  1. name (text, required)
  2. family (select: "traditionnelle" | "sporadique", required) - use Select component
  3. subcategory (select, optional) - options depend on family:
     - if traditionnelle: mensuelle_departement, grande_commemoration, zandakai
     - if sporadique: sporadique_nationale, sporadique_locale
  4. execution_level (text input, optional) - placeholder "national / region / district / groupe"
  5. requires_quota (checkbox) - "Implique des quotas par structure"
  6. requires_committee (checkbox) - "Nécessite un comité d'organisation"
  7. default_recurrence_rule (text, optional) - placeholder "ex: weekly:sunday"
  8. description (textarea, optional)

Props:
- open: boolean
- setOpen: (v: boolean) => void
- onSubmit: (data: ActivityTypeFormData) => void
- isLoading?: boolean
- initialData?: { uuid: string; name: string; family: string; subcategory?: string|null; requires_quota: boolean; requires_committee: boolean; default_recurrence_rule?: string|null; execution_level?: string|null; description?: string|null }
- isEditing?: boolean

Use Dialog/DialogContent size="lg", watch family field to update subcategory options.
Use Checkbox from @/components/ui/checkbox for requires_quota and requires_committee.
Import Label from @/components/ui/label.

Read the LevelModal at ${BASE}/components/form/LevelModal.tsx for the general modal pattern.

Write the complete file.`, { label: 'create-activity-type-modal', phase: 'Components' }),

  () => agent(`Create a new file ${BASE}/components/data-table/ActivityTypeTable.tsx.

Model it after ${BASE}/components/data-table/LevelTable.tsx (read it first).

This table shows activity types. Columns:
1. Nom (name)
2. Famille - badge: "Traditionnelle" (blue) or "Sporadique" (orange/amber)
3. Sous-catégorie - map to French label:
   mensuelle_departement → "Mensuelle Département"
   grande_commemoration → "Grande Commémoration"
   zandakai → "Zandakai"
   sporadique_nationale → "Sporadique Nationale"
   sporadique_locale → "Sporadique Locale"
4. Quotas - show "Oui"/"Non" badge for requires_quota
5. Comité - show "Oui"/"Non" badge for requires_committee
6. Actions - Modifier (warning), Supprimer (destructive)

Props same pattern as other tables: buttonComponent, onEditData, onIsEditing, onOpen, onSetConfirmDeleteOpen, onSetSelectedId.

Use useQuery with queryKey ['activity-types'] and queryFn getActivityTypes (import from @/services/activity).
Use Badge component from @/components/ui/badge with color="info" for Traditionnelle and color="warning" for Sporadique.

For onEditData, pass the full activity type object so the modal can pre-fill.

Write the complete file.`, { label: 'create-activity-type-table', phase: 'Components' }),
]);

// ─── Phase 3: Pages ────────────────────────────────────────────────────────
phase('Pages');

const [settingsPageResult, detailTabsResult] = await parallel([

  () => agent(`Create a new file ${BASE}/app/(dashboard)/parametre/types-activite/page.tsx.

Model it after ${BASE}/app/(dashboard)/parametre/level/page.tsx (read it first for the CrudPage pattern).

This is the CRUD page for managing activity types.

The page should:
1. Use CrudPage component from @/components/shared/CrudPage
2. Use ActivityTypeModal for the form
3. Use ActivityTypeTable for the table
4. resourceKey = "activity-types"
5. title = "TYPES D'ACTIVITÉS"

The transform function:
- Takes ActivityTypeFormData
- Returns CreateActivityTypeData with: name, description, family, subcategory, requires_quota, requires_committee, default_recurrence_rule, execution_level

Add the CreateActivityTypeData type inline or import if it exists.
Import createActivityType, updateActivityType, deleteActivityType from a service file.

First check if these functions exist in ${BASE}/services/activity.ts. If not, note what needs to be added.

Actually, also add these 3 functions to the services/activity.ts file:

export const createActivityType = async (data) => {
  const response = await axiosAuth.post('/activity-types', data);
  return response.data?.data ?? response.data;
};

export const updateActivityType = async (uuid, data) => {
  const response = await axiosAuth.put('/activity-types/' + uuid, data);
  return response.data?.data ?? response.data;
};

export const deleteActivityType = async (uuid) => {
  await axiosAuth.delete('/activity-types/' + uuid);
};

For the page, the onSubmitTransform should handle both create and edit. In edit mode, it receives initialData with uuid.

For editActivity function signature: editActivity(uuid, data) - see existing pattern in services/activity.ts.

Write the complete page file AND update services/activity.ts to add createActivityType, updateActivityType, deleteActivityType if not present.`, { label: 'create-types-page', phase: 'Pages' }),

  () => agent(`Update the detail page at ${BASE}/app/(dashboard)/activites/[activityId]/page.tsx.

READ THE FILE FIRST - it's a large file.

ADD 2 new tabs after the existing "Présence" tab (before the closing TabsList tag).

NEW TAB 1 - Comités d'organisation:
- TabsTrigger value="comites" with icon <Building2> and label "Comités"
- TabsContent that shows:
  - A "Comités d'organisation" card with:
    - Header with title + "Ajouter un comité" button
    - List of committees (from useQuery calling getActivityCommittees)
    - Each committee shown as a collapsible card: name, description, status badge
    - Inside each committee: list of members (with role badges: president=gold, secretaire=blue, membre=gray)
    - "Ajouter un membre" button per committee that opens an inline form or simple dialog
    - Delete committee button

NEW TAB 2 - Quotas:
- TabsTrigger value="quotas" with icon <PieChart> and label "Quotas"
- TabsContent that shows:
  - Summary section: total alloué, total utilisé, reste (3 StatBox)
  - Table of quotas by structure: Structure | Alloué | Utilisé | Restant | Actions
  - "Ajouter un quota" button that shows an inline form (structure selector + quota number)

For the committees tab:
- Import and use: getActivityCommittees, createActivityCommittee, deleteActivityCommittee, addCommitteeMember, removeCommitteeMember from @/services/activity
- Use useState for "addCommitteeOpen" modal state and form state
- Simple inline forms with useState (no complex modal needed)
- Use useMutation for all mutations
- Show committee members with their role as a colored Badge

For the quotas tab:
- Import and use: getActivityQuotas, getActivityQuotaSummary, createActivityQuota, deleteActivityQuota from @/services/activity
- Use getStructures for the structure selector in the "Add quota" form
- Display a simple table with delete buttons

ADD these imports at the top of the file:
- Building2, PieChart, Plus, Trash2, ChevronDown, ChevronUp from lucide-react
- getActivityCommittees, createActivityCommittee, deleteActivityCommittee, addCommitteeMember, removeCommitteeMember, getActivityQuotas, getActivityQuotaSummary, createActivityQuota, deleteActivityQuota from @/services/activity
- ActivityCommitteeAPI, ActivityCommitteeMemberAPI, ActivityQuotaAPI, ActivityQuotaSummary from @/types/activity

IMPORTANT: Keep ALL existing content of the file. Only add the 2 new tabs and their required state/queries/mutations.

For the committee form, use a simple Dialog (not CrudPage). Keep it simple.

For structure selector in quotas, use a simple select that loads from getAllStructures or a similar function if available.

Read the file first and carefully add only what's needed.`, { label: 'update-detail-page', phase: 'Pages' }),
]);

return {
  foundation: { typesResult, servicesResult, validationResult },
  components: { modalResult, tableResult, actTypeModalResult, actTypeTableResult },
  pages: { settingsPageResult, detailTabsResult },
};
