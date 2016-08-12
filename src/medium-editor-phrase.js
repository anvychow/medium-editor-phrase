(function (root, factory) {
  if (typeof module === 'object') {
    module.exports = factory;
  } else if (typeof define === 'function' && define.amd) {
    define(factory);
  } else {
    root.MediumEditorPhrase = factory;
  }
}(this, (function (MediumEditor) {
  const placeholderText = 'safariNeedsTextNode!@#$%^()*~',
    placeholderHtml = '<div data-phrase-placeholder="true"></div>',
    placeholderSelector = 'div[data-phrase-placeholder="true"]';

  /**
   *
   * @param {string} html
   * @returns {string}
   */
  function stripPlaceholderText(html) {
    return html.replace(placeholderText, '');
  }

  /**
   *
   * @param {Node} child
   * @returns {number} offset of the child relative to its parentNode
   */
  function getChildOffset(child) {
    var offset = 1, // offset begins at 1
      sibling = child.parentNode.firstChild;

    while (sibling !== child) {
      offset += 1;
      sibling = sibling.nextSibling;
    }
    return offset;
  }

  return MediumEditor.extensions.button.extend({
    // default values can be overwritten by options on init
    phraseTagName: 'span', // lowercase tagName of the phrase tag
    phraseClassList: [], // classes applied to each phrase tag
    name: 'phrase', // name used to reference the button from Medium Editor
    contentDefault: 'S', // html visible to the user in the toolbar button
    aria: 'Span Button', // aria label
    classList: [], // classes added to the button

    init: function () {
      MediumEditor.Extension.prototype.init.apply(this, arguments);

      // properties not set in options
      this.useQueryState = false; // cannot rely on document.queryCommandState()
      this.phraseHasNoClass = this.phraseClassList.length === 0;
      this.phraseSelector = this.phraseTagName + this.phraseClassList.reduce((selector, className) => selector + '.' + className, '');
      this.openingTag = `<${ this.phraseTagName }${ this.phraseHasNoClass ? '' : ' class="' + this.phraseClassList.join(' ').trim() + '"' }>`;
      this.closingTag = `</${ this.phraseTagName }>`;
      this.button = this.createButton();
      this.on(this.button, 'click', this.handleClick.bind(this));
    },

    /**
     * returns a clone of the selection inside a `div` container
     * @returns {Element}
     */
    cloneSelection: function () {
      var range = MediumEditor.selection.getSelectionRange(this.document),
        container = document.createElement('div');

      container.appendChild(range.cloneContents());
      return container;
    },

    /**
     * check if the node is a phrase
     * @param {Node} node
     * @returns {boolean}
     */
    isPhraseNode: function (node) {
      return !!(
        node &&
        node.tagName.toLowerCase() === this.phraseTagName &&
        (this.phraseHasNoClass ? !node.className : this.phraseClassList.reduce((hasAll, c) => hasAll && node.classList.contains(c), true))
      );
    },

    /**
     *
     * @param {Element} phrase
     */
    removePhraseTags: function (phrase) {
      phrase.outerHTML = phrase.innerHTML;
    },

    /**
     *
     * @param {string} phrase
     * @returns {string}
     */
    addPhraseTags: function (phrase) {
      var closingTagsAtStart = '',
        openingTagsAtEnd = '';

      // innerHTML sometimes returns fragments that start or end
      // with tags that we do not want to wrap in the phrase tags.
      // e.g. `a<b>` should become `<span>a</span><b>`
      // e.g. `</b>a` should become `</b><span>a</span>`
      phrase = phrase.replace(/^(<\/[^>]+>)*/, function (match) {
        closingTagsAtStart = match;
        return '';
      }).replace(/(<[^\/>]+>)*$/, function (match) {
        openingTagsAtEnd = match;
        return '';
      });

      // only add phrase tags if there is phrase text
      if (phrase) {
        phrase = this.openingTag + phrase + this.closingTag;
      }

      return closingTagsAtStart + phrase + openingTagsAtEnd;
    },

    /**
     *
     * @param {Node} container
     * @returns {Array} Array of phrase elements that are in the container
     */
    getSelectionPhrases: function (container) {
      var selectionPhrases = Array.prototype.slice.call(container.querySelectorAll(this.phraseSelector));

      if (this.phraseHasNoClass) {
        selectionPhrases = selectionPhrases.filter(phrase => !phrase.className); // ensure phrases have no className
      }
      return selectionPhrases;
    },

    /**
     * replaces the selection with new html and selects the new html
     * @param {string} html
     * @param {boolean} [shouldSelectHtml]
     */
    replaceSelectionHtml: function (html, shouldSelectHtml) {
      var fragment,
        range = MediumEditor.selection.getSelectionRange(this.document),
        selection = this.document.getSelection();

      // insert html
      range.deleteContents();
      fragment = range.createContextualFragment(html);
      range.insertNode(fragment);

      // remove selection
      selection.removeAllRanges();

      // select html
      if (shouldSelectHtml !== false) {
        if (fragment.firstChild) {
          range.setStartBefore(fragment.firstChild);
          range.setEndAfter(fragment.lastChild);
        }
        selection.addRange(range);
      }
    },

    /**
     * get the innerHTML or textContent
     * @param {Node} node
     * @returns {string}
     */
    getNodeHtml: function (node) {
      switch (node.nodeType) {
        case Node.ELEMENT_NODE:
          return node.innerHTML;
        case Node.TEXT_NODE:
          return node.textContent;
        default:
          return node.innerHTML || node.textContent || '';
      }
    },

    /**
     * check if the selection has a phrase as a child or ancestor
     * @returns {boolean}
     */
    isAlreadyApplied: function () {
      return this.hasSelectionPhrase() || !!this.getAncestorPhrase();
    },

    /**
     * this is necessary because safari will only select text nodes
     * @param {Node} node - the placeholder will be inserted after this node
     * @returns {Node}
     */
    insertTextNodePlaceholderAfter: function (node) {
      return node.parentNode.insertBefore(this.document.createTextNode(placeholderText), node.nextSibling);
    },

    /**
     * html before and after the selection remain phrases,
     * a placeholder text node becomes the selected range,
     * and the selection html is returned.
     * @param {Element} ancestorPhrase
     * @returns {string}
     */
    removeAncestorPhrase: function (ancestorPhrase) {
      var ancestorPhraseParent = ancestorPhrase.parentNode,
        selectionHtml = this.getNodeHtml(this.cloneSelection()),
        selection = this.document.getSelection(),
        range = this.document.createRange(),
        placeholderEl,
        textNodePlaceholder;

      // use the placeholder to update the html before and after the selection
      this.replaceSelectionHtml(placeholderHtml, false);
      ancestorPhrase.outerHTML = ancestorPhrase.cloneNode(true).innerHTML.split(placeholderHtml)
        // add phrase tags to fragments before and after selection
        .map(phrase => phrase && this.addPhraseTags(phrase))
        // re-insert placeholder where selection was
        .join(placeholderHtml);

      // select a text node where the original selection needs to be re-inserted
      selection.removeAllRanges();
      placeholderEl = ancestorPhraseParent.querySelector(placeholderSelector);
      textNodePlaceholder = this.insertTextNodePlaceholderAfter(placeholderEl);
      placeholderEl.parentNode.removeChild(placeholderEl);
      range.selectNode(textNodePlaceholder); // selects text node because safari only allows selection of text nodes.
      selection.addRange(range);

      // return the selection html
      return selectionHtml;
    },

    /**
     *
     * @param {Node} node
     * @param {Node} ancestorNode
     * @returns {boolean}
     */
    isLastChildWithTextContent: function (node, ancestorNode) {
      var n, nodeFound,
        isLastChild = true,
        walk = this.document.createTreeWalker(ancestorNode, NodeFilter.SHOW_TEXT, null, false);

      while (n = walk.nextNode() && isLastChild) {
        if (nodeFound) {
          isLastChild = false;
        }
        if (n === node) {
          nodeFound = true;
        }
      }
      return isLastChild;
    },

    /**
     * if the selection range starts outside of the phrase
     * and ends on the last text node within the phrase,
     * then we need to make sure that the range ends on
     * the phrase so that the phrase tags are removed.
     */
    ensurePhraseSelected: function () {
      var selection = this.window.getSelection(),
        range = MediumEditor.selection.getSelectionRange(this.document),
        endContainer = range.endContainer,
        rangeStartsPriorToEndContainer = endContainer !== range.startContainer,
        endContainerIsText = endContainer.nodeType === Node.TEXT_NODE,
        endContainerIsFullySelected = range.endOffset === endContainer.textContent.length,
        endContainerAncestorPhrase,
        rangeContainingEndContainerAncestorPhrase,
        textNodePlaceholder;

      if (rangeStartsPriorToEndContainer && endContainerIsText && endContainerIsFullySelected) {
        endContainerAncestorPhrase = MediumEditor.util.traverseUp(endContainer, this.isPhraseNode.bind(this));
        if (
          endContainerAncestorPhrase && // node is inside of a phrase
          this.isLastChildWithTextContent(endContainer, endContainerAncestorPhrase) // is the last text node in the phrase
        ) {
          rangeContainingEndContainerAncestorPhrase = this.document.createRange();
          rangeContainingEndContainerAncestorPhrase.setStart(range.startContainer, range.startOffset);
          textNodePlaceholder = this.insertTextNodePlaceholderAfter(endContainerAncestorPhrase);
          rangeContainingEndContainerAncestorPhrase.setEnd(textNodePlaceholder.parentNode, getChildOffset(textNodePlaceholder));
          selection.removeAllRanges();
          selection.addRange(rangeContainingEndContainerAncestorPhrase);
        }
      }
    },

    /**
     * get the HTML from the selected range and either add or remove the phrase tags.
     * @returns {string} HTML
     */
    togglePhraseTags: function () {
      var container, selectionPhrases, html;

      this.ensurePhraseSelected();
      container = this.cloneSelection();
      selectionPhrases = this.getSelectionPhrases(container);
      html = container.innerHTML;

      if (selectionPhrases.length) { // selection already has phrases, so remove them
        selectionPhrases.forEach(this.removePhraseTags); // remove phrases while keeping their innerHTML
        html = container.innerHTML;
      } else if (container.textContent) { // no phrases found and has textContent, so add phrase tags
        html = this.addPhraseTags(html);
      }
      return stripPlaceholderText(html); // placeholderText may have been added by this.ensurePhraseSelected()
    },

    /**
     * traverse down from the selection to find at least one phrase
     * @returns {boolean}
     */
    hasSelectionPhrase: function () {
      return this.getSelectionPhrases(this.cloneSelection()).length > 0;
    },

    /**
     * traverse up from the selection to find the first ancestor phrase
     * @returns {Node|boolean}
     */
    getAncestorPhrase: function () {
      return MediumEditor.util.traverseUp(MediumEditor.selection.getSelectionRange(this.document).startContainer, this.isPhraseNode.bind(this));
    },

    /**
     * when the button is clicked, update the html
     * @param {object} e
     */
    handleClick: function (e) {
      var ancestorPhrase = this.getAncestorPhrase();

      e.preventDefault();
      e.stopPropagation();
      this.replaceSelectionHtml(!ancestorPhrase || this.hasSelectionPhrase() ? this.togglePhraseTags() : this.removeAncestorPhrase(ancestorPhrase));
      this.isAlreadyApplied() ? this.setActive() : this.setInactive(); // update button state
      this.base.checkContentChanged(); // triggers 'editableInput' event
    },
  });
}(typeof require === 'function' ? require('medium-editor') : MediumEditor))));
