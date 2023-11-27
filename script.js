const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");

class RadioInput {
	constructor(name, onChange) {
		this.inputs = document.querySelectorAll(`input[name=${name}]`);
		for (let input of this.inputs) {
			input.addEventListener("change", onChange);
		}
	}

	get value() {
		for (let input of this.inputs) {
			if (input.checked) {
				return input.value;
			}
		}
	}
}

class Input {
	constructor(id, onChange) {
		this.input = document.getElementById(id);
		this.input.addEventListener("change", onChange);
		this.valueAttrib = this.input.type === "checkbox" ? "checked" : "value";
	}

	get value() {
		return this.input[this.valueAttrib];
	}
}

class CubeFace {
	constructor(faceName) {
		this.faceName = faceName;

		this.anchor = document.createElement("a");
		this.anchor.style.position = "absolute";
		this.anchor.title = faceName;

		this.img = document.createElement("img");
		this.img.style.filter = "blur(4px)";

		this.anchor.appendChild(this.img);
	}

	setPreview(url, x, y) {
		this.img.src = url;
		this.anchor.style.left = `${x}px`;
		this.anchor.style.top = `${y}px`;
	}

	setDownload(url, fileExtension) {
		this.anchor.href = url;
		this.anchor.download = `${this.faceName}.${fileExtension}`;
		this.img.style.filter = "";
	}
}

function removeChildren(node) {
	while (node.firstChild) {
		node.removeChild(node.firstChild);
	}
}

const mimeType = {
	jpg: "image/jpeg",
	png: "image/png",
};

function getDataURL(imgData, extension) {
	canvas.width = imgData.width;
	canvas.height = imgData.height;
	ctx.putImageData(imgData, 0, 0);
	return new Promise((resolve) => {
		canvas.toBlob(
			(blob) => resolve(URL.createObjectURL(blob)),
			mimeType[extension],
			1
		);
	});
}

const dom = {
	imageInput: document.getElementById("imageInput"),
	faces: document.getElementById("faces"),
	generating: document.getElementById("generating"),
};

dom.imageInput.addEventListener("change", loadImage);

const settings = {
	cubeRotation: new Input("cubeRotation", loadImage),
	interpolation: new RadioInput("interpolation", loadImage),
	format: new RadioInput("format", loadImage),
};
let faces = [];
const facePositions = {
	b: { x: 1, y: 1 },
	f: { x: 3, y: 1 },
	l: { x: 2, y: 1 },
	r: { x: 0, y: 1 },
	u: { x: 1, y: 0 },
	d: { x: 1, y: 2 },
};

function loadImage() {
	const file = dom.imageInput.files[0];

	if (!file) {
		return;
	}

	const img = new Image();

	img.src = URL.createObjectURL(file);

	let y = 0;
	img.addEventListener("load", () => {
		const { width, height } = img;
		canvas.width = width;
		canvas.height = height;
		ctx.drawImage(img, 0, 0);
		const data = ctx.getImageData(0, 0, width, height);

		processImage(data);
	});
}

let finished = 0;
let workers = [];

function processImage(data) {
	removeChildren(dom.faces);
	dom.generating.style.visibility = "visible";

	for (let worker of workers) {
		worker.terminate();
	}

	for (let [faceName, position] of Object.entries(facePositions)) {
		renderFace(data, faceName, position);
	}
}

function getFile(blobUrl, x, y, facename, folder) {
	return new Promise((resolve, reject) => {
		fetch(blobUrl)
			.then((response) => response.blob())
			.then((blobData) => {
				// Create a File object from the Blob data
				var file = new File([blobData], `${folder}${facename}${x}_${y}.jpg`, {
					type: "image/jpg",
				});
				resolve(file);
			})
			.catch((err) => reject(err));
	});
}

function generateFile(blobUrl, fileName) {
	return new Promise((resolve, reject) => {
		fetch(blobUrl)
			.then((response) => response.blob())
			.then((blobData) => {
				var file = new File([blobData], `${fileName}.jpg`, {
					type: "image/jpg",
				});
				resolve(file);
			})
			.catch((err) => reject(err));
	});
}

function getCanvasBlob(canvas) {
	return canvas.toDataURL();
}

var zip = new JSZip();

async function cropImageIntoTiles(
	image,
	numRows,
	numCols,
	facename,
	width,
	height,
	folder
) {
	// Get the canvas element
	let canvas = document.createElement("canvas");
	let ctx = canvas.getContext("2d");
	var tileFolder = zip.folder(folder);

	// Set the canvas size to match the image size
	canvas.width = width;
	canvas.height = height;

	// Draw the image on the canvas
	ctx.drawImage(image, 0, 0);

	// Calculate the size of each tile
	var tileSizeX = Math.floor(width / numCols);
	var tileSizeY = Math.floor(height / numRows);

	for (var x = 0; x < numCols; x++) {
		for (var y = 0; y < numRows; y++) {
			// Create a new canvas for each tile
			let tileCanvas = document.createElement("canvas");

			let tileCtx = tileCanvas.getContext("2d");
			tileCanvas.width = 512;
			tileCanvas.height = 512;

			// x and y are tile labels

			tileCtx.drawImage(
				canvas,
				x * tileSizeX,
				y * tileSizeY,
				tileSizeX,
				tileSizeY,
				0,
				0,
				512,
				512
			);

			const data = getCanvasBlob(tileCanvas);
			const file = await getFile(data, x, y, facename, folder); // generate file and save to allFiles
			tileFolder.file(`${facename}_${y}_${x}.jpg`, file);
		}
	}
}

let generateTilesPromises = [];
let levels = [2, 4];

function rotateImage(blob) {
	const img = new Image();
	img.src = blob;

	return new Promise((resolve) => {
		img.onload = async () => {
			const canvas = document.createElement("canvas");
			const ctx = canvas.getContext("2d");

			// Set the canvas dimensions based on the rotated image
			canvas.width = img.height;
			canvas.height = img.width;

			// Rotate the image
			ctx.translate(canvas.width / 2, canvas.height / 2);
			ctx.rotate((180 * Math.PI) / 180);
			ctx.drawImage(img, -img.width / 2, -img.height / 2);

			canvas.toBlob((blob) => {
				resolve(URL.createObjectURL(blob));
			});
		};
	});
}

const tileFolder = zip.folder("0");

function processFacesAsync(data) {
	return new Promise(async (resolve, reject) => {
		try {
			// Assuming tileFolder is defined somewhere in your code

			for (const face of data) {
				const file = await getFile(face.blob, 0, 0, face.name, 0);
				tileFolder.file(`${face.name}_${0}_${0}.jpg`, file);

				await Promise.all(
					levels.map(async (l, i) => {
						const img = new Image();
						img.src = face.blob;

						await new Promise((imgResolve) => {
							img.onload = async () => {
								await cropImageIntoTiles(
									img,
									l,
									l,
									face.name,
									face.width,
									face.height,
									i + 1
								);
								imgResolve();
							};
						});
					})
				);
			}

			resolve("Processing completed successfully");
		} catch (error) {
			reject(error);
		}
	});
}

function generateTiles() {
	faces = faces.map(async (face) => {
		if (face.name === "d" || face.name === "u") {
			const newUrl = await rotateImage(face.blob);
			return {
				...face,
				blob: newUrl,
			};
		}

		return face;
	});

	Promise.all(faces).then(async (data) => {
		await processFacesAsync(data).then(() => {
			generatePreview(data).then(async (result) => {
				const previewImage = await generateFile(result);

				zip.file("preview.jpg", previewImage);
				zip.generateAsync({ type: "blob" }).then(function (content) {
					// see FileSaver.js
					saveAs(content, "folder.zip");
				});
			});
		});
	});
}

function generatePreview(faces) {
	return new Promise((resolve, reject) => {
		faces = faces.sort((a, b) => a.name.localeCompare(b.name));

		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d");

		canvas.width = 256;
		canvas.height = 256 * 6;

		let offsetY = 0;

		function loadImage(url) {
			return new Promise((imageResolve, imageReject) => {
				const img = new Image();
				img.onload = () => {
					imageResolve(img);
				};
				img.onerror = (error) => {
					imageReject(error);
				};
				img.src = url;
			});
		}

		async function processImages() {
			for (const face of faces) {
				try {
					const img = await loadImage(face.blob);
					context.drawImage(
						img,
						0,
						0,
						img.width,
						img.height,
						0,
						offsetY,
						256,
						256
					);
					offsetY += 256;
				} catch (error) {
					reject(error);
					return;
				}
			}

			resolve(canvas.toDataURL()); // You can use the result as a data URL or perform other actions
		}

		processImages();
	});
}

const convertTiles = document.getElementById("convertTiles");
convertTiles.addEventListener("click", () => generateTiles());

function renderFace(data, faceName, position) {
	const face = new CubeFace(faceName);
	dom.faces.appendChild(face.anchor);

	const options = {
		data: data,
		face: faceName,
		rotation: (Math.PI * settings.cubeRotation.value) / 180,
		interpolation: settings.interpolation.value,
		size: 512,
	};

	const worker = new Worker("convert.js");

	const setDownload = ({ data: imageData }) => {
		const extension = settings.format.value;

		getDataURL(imageData, "jpg").then(async (url) => {
			faces.push({
				blob: url,
				name: faceName,
				height: imageData.height,
				width: imageData.width,
			});
			face.setDownload(url, extension);
		});

		finished++;

		if (finished === 6) {
			dom.generating.style.visibility = "hidden";
			finished = 0;
			workers = [];
		}
	};

	const setPreview = ({ data: imageData }) => {
		const x = imageData.width * position.x;
		const y = imageData.height * position.y;

		getDataURL(imageData, "jpg").then((url) => face.setPreview(url, x, y));

		worker.onmessage = setDownload;
		worker.postMessage(options);
	};

	worker.onmessage = setPreview;

	worker.postMessage(
		Object.assign({}, options, {
			maxWidth: 200,
			interpolation: "linear",
		})
	);

	workers.push(worker);
}
