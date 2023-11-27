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

function getFileFromBlobURL(blobUrl, face) {
	console.log(face);
	return new Promise((resolve, reject) => {
		fetch(blobUrl)
			.then((response) => response.blob())
			.then((blobData) => {
				const file = new File([blobData], face.faceName, {
					type: mimeType["jpg"],
				});
				resolve(file);
			})
			.catch((error) => {
				reject(error);
			});
	});
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

function getCanvasBlob(canvas) {
	return canvas.toDataURL();
}

let allFiles = [];
var zip = new JSZip();

// function downloadFile(blobUrl, x, y, facename, folder) {
// 	const myFile = new File([blobUrl], `${folder}${facename}${x}_${y}.jpg`, {
// 		type: "image/jpg",
// 	});

// 	return myFile;

// 	fetch(blobUrl)
// 		.then((response) => response.blob())
// 		.then((blob) => {
// 			// Create an anchor element
// 			const a = document.createElement("a");
// 			a.style.display = "none";

// 			// Create a URL for the Blob
// 			const url = window.URL.createObjectURL(blob);

// 			// Set the Blob URL as the anchor's href
// 			a.href = url;

// 			// Set the desired filename for the download
// 			a.download = `${folder}${facename}${x}_${y}.jpg`;

// 			// Append the anchor element to the document body
// 			document.body.appendChild(a);

// 			// Trigger a click event on the anchor element to start the download
// 			a.click();
// 		});
// }

function saveFile(file) {
	// Create a File object

	// Create a Blob URL from the File object
	var blobUrl = URL.createObjectURL(file);

	// Create a temporary anchor element
	var downloadLink = document.createElement("a");
	downloadLink.href = blobUrl;
	downloadLink.download = file.name;

	// Trigger a click event on the anchor element
	document.body.appendChild(downloadLink);
	downloadLink.click();

	// Cleanup: Remove the temporary anchor element
	document.body.removeChild(downloadLink);

	// Cleanup: Revoke the Blob URL to free up resources
	URL.revokeObjectURL(blobUrl);
}

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
	var tileSizeX = 512;
	var tileSizeY = 512;

	for (var x = 0; x < numCols; x++) {
		for (var y = 0; y < numRows; y++) {
			// Create a new canvas for each tile
			let tileCanvas = document.createElement("canvas");

			let tileCtx = tileCanvas.getContext("2d");
			tileCanvas.width = tileSizeX;
			tileCanvas.height = tileSizeY;

			// x and y are tile labels

			tileCtx.drawImage(
				canvas,
				x * tileSizeX,
				y * tileSizeY,
				tileSizeX,
				tileSizeY,
				0,
				0,
				tileSizeX,
				tileSizeY
			);

			document.body.appendChild(tileCanvas);

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

	Promise.all(faces).then((data) => {
		const tileFolder = zip.folder("0");

		data.forEach(async (face) => {
			const file = await getFile(face.blob, 0, 0, face.name, 0); // generate file and save to allFiles
			tileFolder.file(`${face.name}_${0}_${0}.jpg`, file);
			levels.forEach((l, i) => {
				const img = new Image();
				img.src = face.blob;

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
				};
			});
		});
	});
}

const convertTiles = document.getElementById("convertTiles");
convertTiles.addEventListener("click", () => generateTiles());

const downloadButton = document.getElementById("downloadFaces");
downloadButton.addEventListener("click", () => {
	zip.generateAsync({ type: "blob" }).then(function (content) {
		// see FileSaver.js
		saveAs(content, "folder.zip");
	});
});

function renderFace(data, faceName, position) {
	const face = new CubeFace(faceName);
	dom.faces.appendChild(face.anchor);

	const options = {
		data: data,
		face: faceName,
		rotation: (Math.PI * settings.cubeRotation.value) / 180,
		interpolation: settings.interpolation.value,
	};

	const worker = new Worker("convert.js");

	const setDownload = ({ data: imageData }) => {
		const extension = settings.format.value;

		getDataURL(imageData, extension).then(async (url) => {
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
