"use server";

import {
  listCompanies as _listCompanies,
  overrideCompanyCountry as _overrideCompanyCountry,
  type CompanyRow,
} from "@/lib/library/companies-queries";

export async function listCompanies(): Promise<CompanyRow[]> {
  return _listCompanies();
}

export async function overrideCompanyCountry(
  id: string,
  iso: string,
): Promise<CompanyRow> {
  return _overrideCompanyCountry(id, iso);
}
