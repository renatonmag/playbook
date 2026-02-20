"use server";
import { utApi } from "./uploadthing";

export async function deleteFiles(fileKeys: string[]) {
  const response = await utApi.deleteFiles(fileKeys);
  console.log(response);
  return response.success;
}
