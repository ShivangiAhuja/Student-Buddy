from django.core.validators import MaxLengthValidator
from django.db import models

from .validators import normalize_problem_url


class Problem(models.Model):
    title = models.CharField(max_length=255)
    url = models.URLField(max_length=512, unique=True)
    slug = models.SlugField(max_length=200, unique=True)
    statement = models.TextField(validators=[MaxLengthValidator(30000)])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]

    def save(self, *args, **kwargs):
        self.url, self.slug = normalize_problem_url(self.url)
        # Uniqueness is enforced by the DB; avoid a validation race before INSERT.
        self.full_clean(validate_unique=False, validate_constraints=False)
        return super().save(*args, **kwargs)
