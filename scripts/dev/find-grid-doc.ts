import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function findDoc() {
  const { data, error } = await supabase
    .from("documents")
    .select("id, original_name")
    .ilike("original_name", "%grid%")
    .single();

  if (error) console.error(error);
  else console.log(`ID: ${data.id}\nName: ${data.original_name}`);
}

findDoc();
