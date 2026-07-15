# Build schema|table|row_count evidence directly from a pg_dump --use-copy
# artifact. COPY text format represents each logical row on one physical line;
# embedded control characters are escaped by pg_dump.

function fail(message) {
  print "COPY manifest error: " message > "/dev/stderr"
  failed = 1
  exit 1
}

BEGIN {
  if (expected_schema !~ /^[A-Za-z_][A-Za-z0-9_]*$/) {
    fail("expected_schema is missing or unsafe")
  }
  active = 0
  copy_blocks = 0
}

active {
  if ($0 ~ /^\\[.]$/) {
    active = 0
    next
  }
  row_counts[active_key]++
  next
}

/^COPY / {
  if ($0 !~ /^COPY "[A-Za-z_][A-Za-z0-9_]*"[.]"[A-Za-z_][A-Za-z0-9_$]*" .* FROM stdin;$/) {
    fail("unsupported or unsafe COPY header: " $0)
  }
  split($0, quoted_parts, "\"")
  schema_name = quoted_parts[2]
  table_name = quoted_parts[4]
  if (schema_name != expected_schema) {
    fail("unexpected schema " schema_name ", expected " expected_schema)
  }
  if (index(schema_name, "|") || index(table_name, "|")) {
    fail("manifest delimiter found in an identifier")
  }

  active_key = schema_name "|" table_name
  seen[active_key] = 1
  copy_blocks++
  active = 1
  next
}

END {
  if (failed) {
    exit 1
  }
  if (active) {
    print "COPY manifest error: unterminated COPY block" > "/dev/stderr"
    exit 1
  }
  if (copy_blocks == 0) {
    print "COPY manifest error: dump contains no COPY blocks" > "/dev/stderr"
    exit 1
  }
  for (key in seen) {
    printf "%s|%.0f\n", key, row_counts[key]
  }
}
