import { businessRoleLabel, formatJoinedDate } from "@/lib/team";
import type { BusinessMember } from "@/types/business";

type TeamMembersTableProps = {
  members: BusinessMember[];
  timezone: string;
};

export function TeamMembersTable({ members, timezone }: TeamMembersTableProps) {
  if (members.length === 0) {
    return (
      <p className="text-sm text-secondary">Este negocio todavía no tiene miembros.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="border-b border-outline-variant/40 bg-muted/40 text-xs uppercase tracking-wide text-secondary">
          <tr>
            <th className="px-3 py-2 font-medium">Usuario</th>
            <th className="px-3 py-2 font-medium">Rol</th>
            <th className="px-3 py-2 font-medium">Fecha de acceso</th>
            <th className="px-3 py-2 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const primary = member.name ?? member.email ?? "Usuario sin email";
            const secondary = member.name ? member.email : null;

            return (
              <tr
                key={member.user_id}
                className="border-b border-outline-variant/30 last:border-0"
              >
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-on-surface">{primary}</span>
                    {member.is_current_user ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        Tú
                      </span>
                    ) : null}
                  </div>
                  {secondary ? (
                    <p className="text-xs text-secondary">{secondary}</p>
                  ) : null}
                </td>
                <td className="px-3 py-3">{businessRoleLabel(member.role)}</td>
                <td className="px-3 py-3 text-secondary">
                  {formatJoinedDate(member.joined_at, timezone)}
                </td>
                <td className="px-3 py-3">
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 font-mono text-[11px] tracking-wider text-green-800 uppercase">
                    <span className="inline-block size-1.5 rounded-full bg-green-500" />
                    Activo
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
