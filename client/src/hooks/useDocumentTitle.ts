// Sets `document.title` for as long as the component is mounted.
//
// It deliberately does not restore the previous title on unmount — the commented
// -out `prevailOnUnmount` machinery below is the abandoned attempt. Restoring
// races the next route's own title write, so the last mounted owner wins instead.

import { useEffect } from 'react';

// function useDocumentTitle(title, prevailOnUnmount = false) {
// const defaultTitle = useRef(document.title);
function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);

  // useEffect(
  //   () => () => {
  //     if (!prevailOnUnmount) {
  //       document.title = defaultTitle.current;
  //     }
  //   }, []
  // );
}

export default useDocumentTitle;
