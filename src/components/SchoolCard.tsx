import type { Database } from "@/types/database";

type SchoolRow = Database["public"]["Tables"]["schools"]["Row"] & {
  school_authorities?: { name: string; authority_type: string } | null;
  school_programs?: { program_name: string; program_code: string | null }[];
};

export type DesignationBadgeStatus = "designated" | "none_confirmed" | "unavailable" | null;

export interface SchoolCardProps {
  school: SchoolRow;
  designationStatus?: DesignationBadgeStatus;
  distanceKm?: number | null;
  lastVerifiedAt?: string | null;
  sourceName?: string | null;
}

function DesignationBadge({ status }: { status: DesignationBadgeStatus }) {
  if (status === "designated") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
        Designated school
      </span>
    );
  }
  if (status === "none_confirmed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
        Confirmed: not your designated school
      </span>
    );
  }
  if (status === "unavailable") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
        Designation data unavailable
      </span>
    );
  }
  return null;
}

export function SchoolCard({
  school,
  designationStatus = null,
  distanceKm = null,
  lastVerifiedAt = null,
  sourceName = null,
}: SchoolCardProps) {
  return (
    <article
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      aria-labelledby={`school-${school.id}-name`}
    >
      {school.is_demo && (
        <p className="mb-2 inline-block rounded bg-fuchsia-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-fuchsia-800">
          DEMO -- fictional data
        </p>
      )}
      <div className="flex items-start justify-between gap-3">
        <h3 id={`school-${school.id}-name`} className="text-base font-semibold text-slate-900">
          {school.name}
        </h3>
        <DesignationBadge status={designationStatus} />
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-600">
        <div>
          <dt className="inline font-medium text-slate-500">Type: </dt>
          <dd className="inline capitalize">{school.school_type}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-slate-500">Grades: </dt>
          <dd className="inline">
            {school.grade_min}&ndash;{school.grade_max}
          </dd>
        </div>
        {school.school_authorities && (
          <div className="col-span-2">
            <dt className="inline font-medium text-slate-500">Authority: </dt>
            <dd className="inline">{school.school_authorities.name}</dd>
          </div>
        )}
        {school.school_programs && school.school_programs.length > 0 && (
          <div className="col-span-2">
            <dt className="inline font-medium text-slate-500">Programs: </dt>
            <dd className="inline">
              {school.school_programs.map((p) => p.program_name).join(", ")}
            </dd>
          </div>
        )}
        {distanceKm != null && (
          <div className="col-span-2">
            <dt className="inline font-medium text-slate-500">Distance: </dt>
            <dd className="inline">
              {distanceKm.toFixed(1)} km (informational only -- not a designation signal)
            </dd>
          </div>
        )}
        <div className="col-span-2">
          <dt className="inline font-medium text-slate-500">Address: </dt>
          <dd className="inline">{school.address}</dd>
        </div>
      </dl>

      <footer className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-400">
        {sourceName && <span>Source: {sourceName}. </span>}
        {lastVerifiedAt && <span>Last verified {lastVerifiedAt}.</span>}
        {!sourceName && !lastVerifiedAt && <span>Source and verification date unavailable.</span>}
      </footer>
    </article>
  );
}
