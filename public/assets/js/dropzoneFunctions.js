
function drop_handler(event) {
    event.preventDefault();
    // if dropped items aren't files, reject them
    var dt = event.dataTransfer;
    if (dt.items) {
        if (dt.items[0].kind == 'file') {
            var droppedFile = dt.items[0].getAsFile();
            publishFileFunctions.previewAndStageFile(droppedFile);
        }
    }
}

function dragover_handler(event) {
    event.preventDefault();
}

function dragend_handler(event) {
    var dt = event.dataTransfer;
    if (dt.items) {
        for (var i = 0; i < dt.items.length; i++) {
            dt.items.remove(i);
        }
    } else {
        event.dataTransfer.clearData();
    }
}

function dragenter_handler(event) {
    var thisDropzone = document.getElementById(event.target.id);
    thisDropzone.setAttribute('class', 'dropzone dropzone--drag-over row row--margined row--padded row--tall flex-container--column flex-container--center-center');
    thisDropzone.firstElementChild.setAttribute('class', 'hidden');
    thisDropzone.lastElementChild.setAttribute('class', '');

}

function dragexit_handler(event) {
    var thisDropzone = document.getElementById(event.target.id);
    thisDropzone.setAttribute('class', 'dropzone row row--tall row--margined row--padded flex-container--column flex-container--center-center');
    thisDropzone.firstElementChild.setAttribute('class', '');
    thisDropzone.lastElementChild.setAttribute('class', 'hidden');
}

function preview_onmouseenter_handler () {
    document.getElementById('asset-preview-dropzone-instructions').setAttribute('class', 'flex-container--column flex-container--center-center position-absolute');
    document.getElementById('asset-preview').style.opacity = 0.2;
}

function preview_onmouseleave_handler () {
    document.getElementById('asset-preview-dropzone-instructions').setAttribute('class', 'hidden');
    document.getElementById('asset-preview').style.opacity = 1;
}

