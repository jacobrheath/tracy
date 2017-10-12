/* Helper function for updating the list of tracers that have been added. */
function refreshTracerList(onFinished) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "http://127.0.0.1:8081/tracers", true);
    xhr.onreadystatechange = onFinished;
    xhr.send();
}

/* Helper function for pushing bulk events to the API. */
function bulkAddEvents(events) {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", "http://127.0.0.1:8081/tracers/events/bulk", true);
    xhr.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
    var eventsStr = JSON.stringify(events);
    xhr.send(eventsStr);
}

/* Handler function for events triggered from the web page. Events should contain a list of DOM events. This handler
 * searches through each of the DOM events for tracer strings. If it finds a string in the DOM event, it submits
 * an API request to the API server. */
function requestHandler(domEvents) {
    /* Get a fresh list of tracers that have been added. Blocks until we get the list. */
    refreshTracerList(function() {
        if (this.readyState == XMLHttpRequest.DONE) {
            /* Parse the tracers. */
            var tracerList = JSON.parse(this.responseText);
            /* A filtered list of DOM events based on if the event has a tracer in it. Each DOM event can have multiple tracer
             * strings. */
            var filteredDomEvents = []

            /* For each DOM write, search for all the tracer strings and collect their location. */
            for ( var domEventKey in domEvents ) {
                var domEvent = domEvents[domEventKey];
                /* Each DOM write could have many tracer strings in it. Group these together. */
                var tracersPerDomEvent = []

                /* The request is a batched list of DOM events. Iterate through each of them looking for a tracer string. */
                for( var tracerKey in tracerList ) {
                    var tracerString = tracerList[tracerKey]["TracerString"];

                    /* If a tracer was found, make sure all the event data is proper and add it to the list of tracers found for this event.
                     * Continue to the rest of the recorded. */
                    var tracerLocation = domEvent.msg.indexOf(tracerString);
                    if( tracerLocation != -1 ) {
                        /* Add this location data to the list of tracers per DOM event. */
                        tracersPerDomEvent.push(tracerString);
                    }
                }

                /* Sanity check the data we are expecting is in the message. */
                if (!domEvent.msg) {
                    console.error("The DOM event msg field was not set properly.");
                } else if (!domEvent.location.href) {
                    console.error("The DOM event location field was not set properly.");
                } else if (!domEvent.type) {
                    console.error("The DOM event type field was not set properly.");
                } else {
                    /* After collecting all the tracers per DOM event, add this DOM event to the list of filtered DOM events that
                     * will be submitted in bulk to the event API. */
                    if (tracersPerDomEvent.length > 0) {
                        var event = {
                            "Event" : {
                                "Data" :        domEvent.msg,
                                "Location" :    domEvent.location.href,
                                "EventType" :   domEvent.type,
                            },
                            "TracerStrings":    tracersPerDomEvent
                        }
                        filteredDomEvents.push(event);
                    }
                }
            }

            /* Send the events to the API. */
            if (filteredDomEvents.length > 0) {
                bulkAddEvents(filteredDomEvents);
            }
        }

    });
}

/* Global list of DOM writes. Periodically, this will be sent to the background thread and cleared. */
var jobs = []

/* Add a job to the job queue. */
function addJobToQueue(message, sender, sendResponse) {
    jobs.push(message);
}

/* Process all the jobs in the current queue. */
function processDomEvents(){
    /* If there are no new jobs, continue. */
    if (jobs.length > 0) {
        /* Send any jobs off to the API server. */
        requestHandler(JSON.parse(JSON.stringify(jobs)));

        /* Clear out the jobs. */
        jobs = [];
    }
    /* Trigger another timeout after the jobs are cleared. */
    setTimeout(processDomEvents, 3000);
}
/* Start processing jobs. */
setTimeout(processDomEvents, 3000);

/* Any time the page sends a message to the extension, the above handler should take care of it. */
chrome.runtime.onMessageExternal.addListener(addJobToQueue);
chrome.runtime.onMessage.addListener(addJobToQueue);
