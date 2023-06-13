export async function retry<T>(
  operation: () => Promise<T>,
  maxRetries: number,
  retryInterval: number
): Promise<T> {
  try {
    // Attempt the operation and return the result if it succeeds
    return await operation();
  } catch (error: any) {
    console.error(`Error executing operation: ${error.message}`);

    // If there are no more retries left, throw the error
    if (maxRetries <= 0) {
      console.error(
        `Max retries exceeded (${maxRetries}), aborting operation.`
      );
      throw error;
    }

    // Wait for the specified retry interval before attempting the operation again
    console.log(`Retrying operation in ${retryInterval} ms...`);
    await new Promise((resolve) => setTimeout(resolve, retryInterval));

    // Recursively retry the operation with one less retry and return the result if it succeeds
    return await retry(operation, maxRetries - 1, retryInterval);
  }
}
