import { utApi } from "./uploadthing";

export async function deleteFiles(fileKeys: string[]) {
  "use server";
  const response = await utApi.deleteFiles(fileKeys);
  console.log(response);
  return response.success;
}
