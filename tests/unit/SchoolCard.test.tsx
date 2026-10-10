// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SchoolCard } from "@/components/SchoolCard";
import type { Database } from "@/types/database";

type SchoolRow = Database["public"]["Tables"]["schools"]["Row"];

const baseSchool: SchoolRow = {
  id: "s1",
  authority_id: "a1",
  name: "Test Elementary",
  school_type: "public",
  grade_min: "K",
  grade_max: "6",
  address: "123 Test St",
  city: "Calgary",
  postal_code: null,
  phone: null,
  website: null,
  longitude: null,
  latitude: null,
  status: "active",
  source_id: null,
  is_demo: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("SchoolCard", () => {
  it("shows the 'designated' badge and no DEMO label for a real designated school", () => {
    render(<SchoolCard school={baseSchool} designationStatus="designated" />);
    expect(screen.getByText(/Designated school/i)).toBeInTheDocument();
    expect(screen.queryByText(/DEMO/i)).not.toBeInTheDocument();
  });

  it("shows the 'none_confirmed' badge with its exact non-alarming wording", () => {
    render(<SchoolCard school={baseSchool} designationStatus="none_confirmed" />);
    expect(screen.getByText(/Confirmed: not your designated school/i)).toBeInTheDocument();
  });

  it("shows the 'unavailable' badge rather than claiming a negative result", () => {
    render(<SchoolCard school={baseSchool} designationStatus="unavailable" />);
    expect(screen.getByText(/Designation data unavailable/i)).toBeInTheDocument();
  });

  it("shows no badge at all when no designation status is passed", () => {
    render(<SchoolCard school={baseSchool} />);
    expect(screen.queryByText(/Designated school/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Designation data unavailable/i)).not.toBeInTheDocument();
  });

  it("shows the DEMO banner for a fictional record and never for a real one", () => {
    render(<SchoolCard school={{ ...baseSchool, is_demo: true }} />);
    expect(screen.getByText(/DEMO -- fictional data/i)).toBeInTheDocument();
  });

  it("shows 'source unavailable' footer text when no sourceName/lastVerifiedAt is supplied", () => {
    render(<SchoolCard school={baseSchool} />);
    expect(screen.getByText(/Source and verification date unavailable/i)).toBeInTheDocument();
  });

  it("prints the provided source name and verification date instead of the unavailable fallback", () => {
    render(<SchoolCard school={baseSchool} sourceName="City Open Data" lastVerifiedAt="2026-01-01" />);
    expect(screen.getByText(/City Open Data/)).toBeInTheDocument();
    expect(screen.getByText(/2026-01-01/)).toBeInTheDocument();
    expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument();
  });
});
