"""V7 core tables

Revision ID: 20260318_0001
Revises:
Create Date: 2026-03-18
"""

from alembic import op
import sqlalchemy as sa


revision = "20260318_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "companies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("sector", sa.String(length=120), nullable=False, server_default="unknown"),
        sa.Column("current_ors_v2", sa.Float(), nullable=False, server_default="0"),
        sa.Column("source_confidence_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("market_fit_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("trigger_strength", sa.Float(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_companies_id", "companies", ["id"])

    op.create_table(
        "thesis_outputs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("headline", sa.String(length=255), nullable=False),
        sa.Column("why_now_json", sa.JSON(), nullable=False),
        sa.Column("recommended_structures_json", sa.JSON(), nullable=False),
        sa.Column("key_risks_json", sa.JSON(), nullable=False),
        sa.Column("suggested_outreach_angle", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_thesis_outputs_company_id", "thesis_outputs", ["company_id"])

    op.create_table(
        "market_map_cards",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("primary_asset_type", sa.String(length=120), nullable=False),
        sa.Column("primary_structure", sa.String(length=120), nullable=False),
        sa.Column("secondary_structures_json", sa.JSON(), nullable=False),
        sa.Column("market_fit_score", sa.Float(), nullable=False),
        sa.Column("investor_profile_hint", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_market_map_cards_company_id", "market_map_cards", ["company_id"])

    op.create_table(
        "monitoring_outputs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("source_type", sa.String(length=100), nullable=False),
        sa.Column("source_name", sa.String(length=255), nullable=False),
        sa.Column("output_json", sa.JSON(), nullable=False),
        sa.Column("observed_signals_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_monitoring_outputs_company_id", "monitoring_outputs", ["company_id"])

    op.create_table(
        "score_history_v2",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("current_ors_v2", sa.Float(), nullable=False),
        sa.Column("score_delta", sa.Float(), nullable=False),
        sa.Column("trigger_strength", sa.Float(), nullable=False),
        sa.Column("source_confidence_score", sa.Float(), nullable=False),
        sa.Column("market_fit_score", sa.Float(), nullable=False),
        sa.Column("ranking_v2", sa.Float(), nullable=False),
        sa.Column("component_snapshot_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_score_history_v2_company_id", "score_history_v2", ["company_id"])


def downgrade() -> None:
    op.drop_index("ix_score_history_v2_company_id", table_name="score_history_v2")
    op.drop_table("score_history_v2")
    op.drop_index("ix_monitoring_outputs_company_id", table_name="monitoring_outputs")
    op.drop_table("monitoring_outputs")
    op.drop_index("ix_market_map_cards_company_id", table_name="market_map_cards")
    op.drop_table("market_map_cards")
    op.drop_index("ix_thesis_outputs_company_id", table_name="thesis_outputs")
    op.drop_table("thesis_outputs")
    op.drop_index("ix_companies_id", table_name="companies")
    op.drop_table("companies")
