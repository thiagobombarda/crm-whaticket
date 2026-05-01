import axios, { AxiosRequestConfig } from "axios";

export const GRAPH_TIMEOUT_MS = 10_000;

export type GraphAuth =
  | { mode: "query"; baseUrl: string; token: string }
  | { mode: "header"; baseUrl: string; token: string };

const buildConfig = (auth: GraphAuth, params?: object): AxiosRequestConfig =>
  auth.mode === "header"
    ? {
        baseURL: auth.baseUrl,
        headers: { Authorization: `Bearer ${auth.token}` },
        params,
        timeout: GRAPH_TIMEOUT_MS
      }
    : {
        baseURL: auth.baseUrl,
        params: { ...params, access_token: auth.token },
        timeout: GRAPH_TIMEOUT_MS
      };

export const metaGraphGet = async <T>(
  path: string,
  auth: GraphAuth,
  params?: object
): Promise<T> => {
  const { data } = await axios.get<T>(path, buildConfig(auth, params));
  return data;
};

export const metaGraphPost = async <T>(
  path: string,
  auth: GraphAuth,
  body: unknown
): Promise<T> => {
  const { data } = await axios.post<T>(path, body, buildConfig(auth));
  return data;
};

export const metaGraphDelete = async <T>(
  path: string,
  auth: GraphAuth
): Promise<T> => {
  const { data } = await axios.delete<T>(path, buildConfig(auth));
  return data;
};
