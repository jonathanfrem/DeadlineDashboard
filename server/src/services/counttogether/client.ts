const BASE_URL = "https://developers.counttogether.app";

interface CounterResponse {
  id: string;
  name: string;
  type: string;
  value: number;
}

export async function fetchMayaCrashCount(
  apiKey: string,
  counterId: string
): Promise<number> {
  const url = `${BASE_URL}/v2/counters/${counterId}?timezone=Europe/Oslo`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    throw new Error(
      `Count Together API returned ${response.status} for counter ${counterId}`
    );
  }

  const data = (await response.json()) as CounterResponse;
  return data.value;
}
