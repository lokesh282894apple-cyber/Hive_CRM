import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateCronAuth } from "@/lib/marketing/track-auth";
import {
  fitConversionModel,
  MIN_LABELS_FOR_FIT,
  MIN_LOSSES,
  MIN_WINS,
} from "@/lib/leads/score-learn";

/**
 * Weekly refit of the empirical conversion likelihood model from closed_won / closed_lost.
 * No-op until enough labeled outcomes exist.
 */
export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const model = await fitConversionModel(admin);

  if (!model) {
    return NextResponse.json({
      ok: true,
      fitted: false,
      message: `Need ≥${MIN_LABELS_FOR_FIT} closed leads with ≥${MIN_WINS} wins and ≥${MIN_LOSSES} losses`,
    });
  }

  return NextResponse.json({
    ok: true,
    fitted: true,
    nTotal: model.nTotal,
    nWon: model.nWon,
    nLost: model.nLost,
    auc: model.auc,
    fittedAt: model.fittedAt,
  });
}
