import React from 'react';

export function NoteTitleCard({ title }) {
  return (
    <div className="note-title-card">
      <span className="note-title-card__label">Note</span>
      <strong className="note-title-card__title">{title}</strong>
    </div>
  );
}

export default NoteTitleCard;
