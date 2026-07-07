import React from 'react';

interface StatusBadgeProps {
  status: string;
}

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  provisioning: 'Provisioning',
  provision_failed: 'Failed',
  active: 'Active',
  suspended: 'Suspended',
  deleting: 'Deleting',
  deleted: 'Deleted',
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-${status}`}>
      {statusLabels[status] ?? status}
    </span>
  );
}
