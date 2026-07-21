# Spend guardrail. Does not cap anything — it emails at the thresholds so a
# runaway scan loop is noticed the same day, not at credit exhaustion.
# Needs roles/billing.admin on the billing account; leave billing_account_id
# empty to skip.

resource "google_billing_budget" "project" {
  count = var.billing_account_id != "" ? 1 : 0

  billing_account = var.billing_account_id
  display_name    = "${local.prefix} monthly budget"

  budget_filter {
    projects               = ["projects/${data.google_project.this.number}"]
    calendar_period        = "MONTH"
    credit_types_treatment = "INCLUDE_ALL_CREDITS"
  }

  amount {
    specified_amount {
      currency_code = var.budget_currency
      units         = tostring(var.monthly_budget)
    }
  }

  dynamic "threshold_rules" {
    for_each = [0.5, 0.9, 1.0]
    content {
      threshold_percent = threshold_rules.value
      spend_basis       = "CURRENT_SPEND"
    }
  }

  # Forecast-based warning: fires when the month is *projected* to blow the cap.
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }

  dynamic "all_updates_rule" {
    for_each = local.alerts_enabled ? [1] : []
    content {
      monitoring_notification_channels = [google_monitoring_notification_channel.email[0].id]
      disable_default_iam_recipients   = false
    }
  }

  depends_on = [google_project_service.services]
}
