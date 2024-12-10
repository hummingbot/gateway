// Design the node structure
class Node {
  constructor(value) {
    this.value = value;
    this.next = null;
  }
}

// Main Liked List class
class LinkedList {
  constructor() {
    this.nodes = null;
    this.size = 0;
  }

  append(value) {
    const newNode = new Node(value);

    if (!this.nodes) {
      // Caso a lista esteja vazia, o novo nó será o head
      this.nodes = newNode;
    } else {
      // Percorre até o final da lista e adiciona o novo nó
      let current = this.nodes;
      while (current.next) {
        current = current.next;
      }
      current.next = newNode;
    }

    this.size++;
  }

}

const ll = new LinkedList();

ll.append(10);
ll.append(20);
ll.append(30);

console.log(ll);