-- Optional human-readable click label from website tracker (button text, aria-label, etc.)
alter table page_events
  add column if not exists element_label text;
