import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Edge Function: process-deletions
 *
 * Processes account deletion requests that are older than 15 days
 * (LGPD compliance). Can be triggered via:
 * - Supabase cron (pg_cron extension)
 * - Manual invocation with service_role key
 *
 * Actions performed per user:
 * 1. Delete all diagnoses from pragas_diagnoses
 * 2. Delete subscription record from subscriptions
 * 3. Delete profile from pragas_profiles
 * 4. Delete auth user via admin API
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// LGPD: process deletions after 15 days
const DELETION_GRACE_PERIOD_DAYS = 15;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Only allow POST with service_role authorization
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.includes(SUPABASE_SERVICE_ROLE_KEY)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Find profiles with deletion_requested_at older than grace period
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DELETION_GRACE_PERIOD_DAYS);

    const { data: profilesForDeletion, error: fetchError } = await supabase
      .from("pragas_profiles")
      .select("id, full_name, deletion_requested_at")
      .not("deletion_requested_at", "is", null)
      .lte("deletion_requested_at", cutoffDate.toISOString());

    if (fetchError) {
      console.error("Error fetching profiles for deletion:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch deletion requests" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!profilesForDeletion || profilesForDeletion.length === 0) {
      return new Response(
        JSON.stringify({
          message: "No pending deletions",
          processed: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const results: { userId: string; success: boolean; error?: string }[] = [];

    for (const profile of profilesForDeletion) {
      try {
        const userId = profile.id;

        // 1. Delete all diagnoses
        const { error: diagError } = await supabase
          .from("pragas_diagnoses")
          .delete()
          .eq("user_id", userId);

        if (diagError)
          console.error(`Failed to delete diagnoses for ${userId}:`, diagError);

        // 2. Delete subscription
        const { error: subError } = await supabase
          .from("subscriptions")
          .delete()
          .eq("user_id", userId);

        if (subError)
          console.error(
            `Failed to delete subscription for ${userId}:`,
            subError,
          );

        // 3. Delete profile
        const { error: profileError } = await supabase
          .from("pragas_profiles")
          .delete()
          .eq("id", userId);

        if (profileError)
          console.error(
            `Failed to delete profile for ${userId}:`,
            profileError,
          );

        // 4. Delete auth user (this cascades in most setups, but we do it explicitly)
        const { error: authError } =
          await supabase.auth.admin.deleteUser(userId);

        if (authError) {
          console.error(`Failed to delete auth user ${userId}:`, authError);
          results.push({ userId, success: false, error: authError.message });
        } else {
          console.log(
            `Successfully deleted user ${userId} (${profile.full_name})`,
          );
          results.push({ userId, success: true });
        }
      } catch (err) {
        console.error(`Error processing deletion for ${profile.id}:`, err);
        results.push({
          userId: profile.id,
          success: false,
          error: (err as Error).message,
        });
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return new Response(
      JSON.stringify({
        message: `Processed ${results.length} deletion requests`,
        processed: results.length,
        successful,
        failed,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Process deletions error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
