import { NextResponse } from "next/server";
import { destinations } from "@/lib/destinations";
import { searchCheapestFlights } from "@/lib/search";
import type { DateOption } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const validDateOptions: DateOption[] = ["tomorrow", "this_week", "this_month"];
const validCities = new Set(destinations.map((destination) => destination.city));

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city") ?? "all";
  const dateOption = searchParams.get("dateOption") as DateOption | null;

  if (!dateOption || !validDateOptions.includes(dateOption)) {
    return NextResponse.json(
      { error: "Geçersiz dateOption. Beklenen: tomorrow, this_week, this_month" },
      { status: 400 }
    );
  }

  if (city !== "all" && !validCities.has(city)) {
    return NextResponse.json({ error: `Geçersiz destinasyon: ${city}` }, { status: 400 });
  }

  const results = await searchCheapestFlights({ city, dateOption });
  return NextResponse.json({ results });
}
