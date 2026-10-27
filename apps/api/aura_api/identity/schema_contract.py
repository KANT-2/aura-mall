"""Read-only checks for the lifecycle extension, not a migration or schema owner."""

import re

# ! = NOT NULL, ? = nullable. Additional unrelated columns/tables are allowed.
REQUIRED_COLUMNS = {
    "users": {
        "id": "uuid!",
        "email": "varchar!",
        "password_hash": "varchar!",
        "is_active": "bool!",
        "deactivated_at": "timestamptz?",
        # Deletion grace period and purge (migration 0005).
        "deletion_requested_at": "timestamptz?",
        "deletion_scheduled_at": "timestamptz?",
        "deleted_at": "timestamptz?",
    },
    "login_failures": {
        "email_hash": "varchar!",
        "failure_count": "int4!",
        "locked_until": "timestamptz?",
        "updated_at": "timestamptz!",
    },
    "member_deletion_runs": {
        "id": "uuid!",
        "status": "varchar!",
        "dry_run": "bool!",
        "failed_user_ids": "_uuid!",
    },
    "revoked_tokens": {"jti": "uuid!", "expires_at": "timestamptz!"},
    "auth_token_families": {
        "id": "uuid!",
        "user_id": "uuid!",
        "created_at": "timestamptz!",
        "revoked_at": "timestamptz?",
    },
    "refresh_tokens": {
        "id": "uuid!",
        "user_id": "uuid!",
        "family_id": "uuid!",
        "token_hash": "varchar!",
        "created_at": "timestamptz!",
        "expires_at": "timestamptz!",
        "consumed_at": "timestamptz?",
        "revoked_at": "timestamptz?",
        "access_jti": "uuid!",
        "access_expires_at": "timestamptz!",
    },
    # Admin access tokens (migration 0003): is_revoked also accepts a live admin session.
    "admins": {"id": "uuid!", "status": "varchar!"},
    "admin_sessions": {
        "jti": "uuid!",
        "admin_id": "uuid!",
        "expires_at": "timestamptz!",
        "revoked_at": "timestamptz?",
    },
}
PRIMARY_KEYS = {
    "users": ("id",),
    "revoked_tokens": ("jti",),
    "auth_token_families": ("id",),
    "refresh_tokens": ("id",),
    "admins": ("id",),
    "admin_sessions": ("jti",),
    "login_failures": ("email_hash",),
    "member_deletion_runs": ("id",),
}
FOREIGN_KEYS = (
    ("auth_token_families", ("user_id",), "users", ("id",)),
    ("refresh_tokens", ("family_id", "user_id"), "auth_token_families", ("id", "user_id")),
    ("admin_sessions", ("admin_id",), "admins", ("id",)),
)


def contract_gaps(
    columns: list[dict], constraints: list[dict], indexes: list[dict], schema: str
) -> list[str]:
    """Inspect_contract prefilters validated constraints and valid, non-partial UNIQUE indexes."""
    gaps = []
    found = {(row["table_name"], row["column_name"]): row for row in columns}
    for table, fields in REQUIRED_COLUMNS.items():
        if not any(name == table for name, _ in found):
            gaps.append(f"{table}: missing table")
            continue
        for name, rule in fields.items():
            row = found.get((table, name))
            if row is None:
                gaps.append(f"{table}.{name}: missing column")
            elif row["udt_name"] != rule[:-1] or (row["is_nullable"] == "YES") != rule.endswith(
                "?"
            ):
                gaps.append(f"{table}.{name}: incompatible type/nullability")
            elif (table, name) in {
                ("users", "email"),
                ("users", "password_hash"),
                ("refresh_tokens", "token_hash"),
            }:
                minimum = {"email": 254, "password_hash": 255, "token_hash": 64}[name]
                if (
                    row["character_maximum_length"] is not None
                    and row["character_maximum_length"] < minimum
                ):
                    gaps.append(f"{table}.{name}: insufficient length")
    primary = {
        (row["table_name"], tuple(row["columns"])) for row in constraints if row["kind"] == "p"
    }
    for table, names in PRIMARY_KEYS.items():
        if (table, names) not in primary:
            gaps.append(f"{table}: missing primary key")
    foreign = {
        (
            row["table_name"],
            tuple(row["columns"]),
            row["target_table"],
            tuple(row["target_columns"]),
        )
        for row in constraints
        if row["kind"] == "f" and row["target_schema"] == schema
    }
    for requirement in FOREIGN_KEYS:
        if requirement not in foreign:
            gaps.append(f"{requirement[0]}: missing ownership foreign key")
    unique = {
        (row["table_name"], tuple(row["columns"]))
        for row in indexes
        if row.get("predicate") is None
    }
    if ("refresh_tokens", ("token_hash",)) not in unique:
        gaps.append("refresh_tokens.token_hash: missing unconditional unique index")
    if ("refresh_tokens", ("access_jti",)) not in unique:
        gaps.append("refresh_tokens.access_jti: missing unconditional unique index")
    if not any(
        row["table_name"] == "users"
        and row["key_count"] == 1
        and re.sub(r'[\s"()]|::text', "", row["expression"] or "") == "loweremail"
        and re.sub(r'[\s"()]', "", row.get("predicate") or "").lower() == "deactivated_atisnull"
        for row in indexes
    ):
        gaps.append("users.email: missing non-deactivated lower(email) unique index")
    return gaps


async def inspect_contract(connection, schema: str) -> list[str]:
    cursor = await connection.execute(
        """SELECT table_name, column_name, udt_name, is_nullable, character_maximum_length
           FROM information_schema.columns WHERE table_schema = %s""",
        (schema,),
    )
    columns = await cursor.fetchall()
    cursor = await connection.execute(
        """SELECT t.relname AS table_name, c.contype::text AS kind,
             ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(num,ord)
                   JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num
                   ORDER BY k.ord) AS columns,
             rt.relname AS target_table, rn.nspname AS target_schema,
             ARRAY(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY k(num,ord)
                   JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num
                   ORDER BY k.ord) AS target_columns
           FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
           JOIN pg_namespace n ON n.oid=t.relnamespace
           LEFT JOIN pg_class rt ON rt.oid=c.confrelid
           LEFT JOIN pg_namespace rn ON rn.oid=rt.relnamespace
           WHERE n.nspname=%s AND c.contype IN ('p','f') AND c.convalidated""",
        (schema,),
    )
    constraints = await cursor.fetchall()
    cursor = await connection.execute(
        """SELECT t.relname AS table_name, i.indnkeyatts AS key_count,
             pg_get_expr(i.indexprs,i.indrelid) AS expression,
             pg_get_expr(i.indpred,i.indrelid) AS predicate,
             ARRAY(SELECT a.attname FROM unnest(i.indkey) WITH ORDINALITY k(num,ord)
                   LEFT JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num
                   WHERE k.ord <= i.indnkeyatts ORDER BY k.ord) AS columns
           FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid
           JOIN pg_namespace n ON n.oid=t.relnamespace
           WHERE n.nspname=%s AND i.indisunique AND i.indisvalid""",
        (schema,),
    )
    indexes = await cursor.fetchall()
    return contract_gaps(columns, constraints, indexes, schema)
