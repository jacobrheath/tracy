import { Strings, EventTypes } from "../shared/constants";
import { takeFormAndAddTracers } from "../shared/screenshot-client";
import { getElementByNameAndValue } from "../shared/ui-helpers";
export const formModInit = (replace, rpc) => {
  const replaceFormInputs = (form) =>
    [...new FormData(form)].reduce((allTracers, [nameAttr, value]) => {
      const { tracers, str } = replace.str(value);
      if (tracers.length <= 0) {
        return allTracers;
      }

      // If there was tracers in the input value, find the input element
      // associated with that name and replace it's value. This probably
      // won't work for all elements, although new FormData only works for elements that have
      // name attributes. Other mods should get the other types of elements.
      const elem = getElementByNameAndValue(nameAttr, value);
      if (!elem) {
        return allTracers;
      }
      elem.value = str;
      return [...tracers, ...allTracers];
    }, []);

  const formSubmitListener = (evt, shouldPreventDefault = false) => {
    const tracers = replaceFormInputs(evt.target);
    if (tracers.length === 0) {
      if (shouldPreventDefault) {
        evt.preventDefault();
      }
      return;
    }
    evt.preventDefault();
    // Ideally, we'd like to take a screenshot here, but its a little tricky.
    // 1.) If we try to take a screenshot now, it won't finish in time before the
    //     form is submitted because capturing a screenshot is asynchronouns the
    //     form submission won't wait for it.
    // 2.) We can prevent default the behavior of the form, then submit the form
    //     using .submit(), but.submit() is different than clicking the submit button
    //     any in some applications won't submit all the fields (those with type=submit,
    //     in cases where there are multiple buttons to submit a form, this field is sent as a POST body
    //     argument to indicate which button was clicked)
    // 3.) We double submit the form, capturing the screenshot the first round, then doing
    //     the button click again. This would cause issues with double doing all the onsubmit
    //     event listeners in the page.

    // #2 is the best option, but we just need to remove the type=submit from button
    // that submitted the forms so that it will get sent as a regular POST body
    // parameter. This button is found in evt.explictOriginalTarget. Creat of copy
    // of this element minus the type=submit and embed it into the form. We also
    // want make sure its hidden so it doesn't look funky.
    (async () => {
      if (evt.explicitOriginalTarget) {
        const i = document.createElement(Strings.INPUT);
        [...evt.explicitOriginalTarget.attributes]
          .filter(
            (a) => a.nodeName !== Strings.TYPE && a.value !== Strings.INPUT
          )
          .map((a) => i.setAttribute(a.nodeName, a.value));
        i.setAttribute(Strings.TYPE, Strings.HIDDEN);
        evt.target.appendChild(i);
      }
      await takeFormAndAddTracers(rpc, evt.target, tracers);
      if (!shouldPreventDefault) {
        evt.target.submit();
      }
    })();
  };

  const formAddedToDOM = () => {
    // Since we can't pass the exact DOM node from the mutation observer,
    // take the forms we have already proxied with a custom class.
    [...document.getElementsByTagName(Strings.FORM)]
      .filter((f) => !f.classList.contains(Strings.TRACY_FORM_MOD))
      .map((f) => {
        f.addEventListener(EventTypes.Submit, formSubmitListener);
        return f;
      })
      .map((f) => {
        f.classList.add(Strings.TRACY_FORM_MOD);
        return f;
      })
      .map((f) => {
        // We need to proxy the submit function call because the submit
        // function call doesn't trigger submit events and therefor
        // our handler code won't get called
        const submitProxy = {
          apply: (t, thisa, al) => {
            // Since we are submitting the form with JavaScript, remove the onsubmit handler
            // for this form. It is only used for regular form submissions.
            f.removeEventListener(EventTypes.Submit, replaceFormInputs);

            // Replace the tracers, and since we are not in an onsubmit handler
            // we can wait for the screen capture to finish and then submit the form.
            const tracers = replaceFormInputs(f);
            if (tracers.length === 0) {
              Reflect.apply(t, thisa, al);
              return;
            }
            (async () => {
              await takeFormAndAddTracers(rpc, f, tracers);
              Reflect.apply(t, thisa, al);
            })();
            return tracers;
          },
        };
        f.submit = new Proxy(f.submit, submitProxy);
        // mainly adding this for testing purposes so tests have access to any
        // tracers returned from this function
        if (f.requestSubmit) {
          f.requestSubmit = new Proxy(f.requestSubmit, submitProxy);
        }
        return f;
      })
      .map((f) => {
        // If the page adds a submit listener, we need to move our
        // listeners back to the bottom of the bubbling so that
        // we can ensure we are the last submit handler to be called
        f.addEventListener = new Proxy(f.addEventListener, {
          apply: (t, thisa, al) => {
            if (al[0] === EventTypes.Submit) {
              f.removeEventListener(EventTypes.Submit, formSubmitListener);
              Reflect.apply(t, thisa, al);
              Reflect.apply(t, thisa, [al[0], formSubmitListener, al[2]]);
            }
          },
        });
      });
  };

  // Forms can have inline onsubmit handlers. These handlers are not called
  // if we addEventListeners with the "onsubmit" type. The strategy here
  // is to convert all inline onsubmit handlers to regular addEventListeners
  // being careful to respect the prevent default behavior when returning false
  // form an inline handler
  Object.defineProperty(HTMLFormElement.prototype, "onsubmit", {
    set: function (value) {
      this.removeEventListener(EventTypes.Submit, formSubmitListener);
      const wrapper = (e) => {
        // returning false from this function means we need to preventDefault
        const shouldPreventDefault = !value(e);
        formSubmitListener(e, shouldPreventDefault);
      };
      this.addEventListener(EventTypes.Submit, wrapper);
      // indicate to the handler above we don't need this form to addEventListeners
      // because it is an inline handler
      this.classList.add(Strings.TRACY_FORM_MOD);
    },
  });
  formAddedToDOM();
  window.addEventListener(EventTypes.FormAddedToDOM, () => formAddedToDOM());
};
