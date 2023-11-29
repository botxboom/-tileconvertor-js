# Panorama To Cubemap

A web app which converts 360° panoramas to six cube faces and allows one to download tiles for 3 levels

## Features

- Runs in your browser by using the Canvas API to manipulate image data.
- Uses Lanczos interpolation for high quality output.
- Ability to rotate cubemap to control the orientation of the scene.

## Project Setup
- clone the repo `git clone https://github.com/botxboom/-tileconvertor-js.git`
- use liveserver in vscode (extension) and run the `index.html` file
- upload equirect image
- once the cubemap is generated, click convert button
- a zip will be downloaded with tiles and preview image

