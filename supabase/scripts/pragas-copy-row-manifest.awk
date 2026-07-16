# Build schema|table|row_count evidence directly from a pg_dump --use-copy
# artifact. COPY text format represents each logical row on one physical line;
# embedded control characters are escaped by pg_dump.

function fail(message) {
  print "COPY manifest error: " message > "/dev/stderr"
  failed = 1
  exit 1
}

BEGIN {
  if (expected_schema != "") {
    if (expected_schema !~ /^[A-Za-z_][A-Za-z0-9_]*$/) {
      fail("expected_schema is unsafe")
    }
    allowed_schema[expected_schema] = 1
    allowed_schema_count = 1
  } else {
    expected_schema_count = split(expected_schemas, schema_parts, ",")
    for (schema_index = 1; schema_index <= expected_schema_count; schema_index++) {
      schema_name = schema_parts[schema_index]
      if (schema_name !~ /^[A-Za-z_][A-Za-z0-9_]*$/ \
          || allowed_schema[schema_name]) {
        fail("expected_schemas is missing, duplicated or unsafe")
      }
      allowed_schema[schema_name] = 1
      allowed_schema_count++
    }
  }
  if (allowed_schema_count == 0) {
    fail("an expected schema allowlist is required")
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
  if (!allowed_schema[schema_name]) {
    fail("unexpected schema " schema_name)
  }
  if (index(schema_name, "|") || index(table_name, "|")) {
    fail("manifest delimiter found in an identifier")
  }

  active_key = schema_name "|" table_name
  seen[active_key] = 1
  seen_schema[schema_name] = 1
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
  for (schema_name in allowed_schema) {
    if (!seen_schema[schema_name]) {
      print "COPY manifest error: expected schema absent from dump: " \
        schema_name > "/dev/stderr"
      exit 1
    }
  }
  for (key in seen) {
    printf "%s|%.0f\n", key, row_counts[key]
  }
}
