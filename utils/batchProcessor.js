export default async function batchProcessor({
  data = [],
  batchSize = 5,
  callback,
  delay = 300
}) {

  const results = [];

  for (
    let i = 0;
    i < data.length;
    i += batchSize
  ) {

    const batch =
      data.slice(i, i + batchSize);

    const batchResults =
      await Promise.allSettled(
        batch.map(callback)
      );

    const success =
      batchResults
        .filter(
          item =>
            item.status === "fulfilled"
        )
        .map(
          item => item.value
        )
        .filter(Boolean);

    results.push(...success);

    await new Promise(resolve =>
      setTimeout(resolve, delay)
    );

  }

  return results;

}