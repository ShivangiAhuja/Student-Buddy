from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("auth", "0012_alter_user_first_name_max_length")]
    operations = [
        # The standard User model has no unique email constraint. Enforce the
        # API invariant at the database too, including concurrent registrations.
        # Empty emails remain allowed for built-in management commands.
        # This partial expression index works on SQLite and PostgreSQL.
        migrations.RunSQL(
            "CREATE UNIQUE INDEX accounts_user_email_ci ON auth_user (LOWER(email)) WHERE email <> '';",
            "DROP INDEX accounts_user_email_ci;",
        ),
    ]
