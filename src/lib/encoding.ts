export function decodeBase64(data: string) {
	const binary = atob(data);
	const buf = new Uint8Array(binary.length);

	for (let i = 0; i < binary.length; i++) {
		buf[i] = binary.charCodeAt(i);
	}

	return buf;
}

export function encodeBase64(data: Uint8Array) {
	let binary = "";
	for (let i = 0; i < data.length; i++) {
		binary += String.fromCharCode(...data.subarray(i, i + 1));
	}

	return btoa(binary);
}
